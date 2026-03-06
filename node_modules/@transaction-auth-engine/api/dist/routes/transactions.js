"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionRoutes = transactionRoutes;
const shared_1 = require("@transaction-auth-engine/shared");
const submit_transaction_js_1 = require("../use-cases/submit-transaction.js");
const BALANCE_PREFIX = 'balance:';
const INITIAL_BALANCE = 10_000;
const bodySchema = {
    type: 'object',
    required: ['accountId', 'amount', 'currency', 'merchantId', 'idempotencyKey'],
    properties: {
        accountId: { type: 'string' },
        amount: { type: 'integer', minimum: 1 },
        currency: { type: 'string', enum: ['BRL', 'USD', 'EUR'] },
        merchantId: { type: 'string' },
        idempotencyKey: { type: 'string', format: 'uuid' },
        targetBankCode: { type: 'string', description: 'Bank code for TED/DOC/PIX (e.g. 033)' },
        biometricToken: { type: 'string', description: 'Optional biometric validation token (Face ID / Touch ID simulation)' },
    },
};
const currencyConverter = new shared_1.CurrencyConverter();
const paramsSchema = {
    type: 'object',
    properties: {
        id: { type: 'string', format: 'uuid' },
    },
};
async function transactionRoutes(app, opts) {
    const { producer, redis } = opts;
    app.post('/api/v1/transactions', {
        schema: {
            body: bodySchema,
            response: {
                201: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        idempotencyKey: { type: 'string' },
                        accountId: { type: 'string' },
                        amount: { type: 'integer' },
                        currency: { type: 'string' },
                        merchantId: { type: 'string' },
                        status: { type: 'string', enum: ['PENDING'] },
                        targetBankCode: { type: 'string' },
                        amountBRL: { type: 'integer' },
                        rate: { type: 'number' },
                        bankName: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body;
        let amountBRL;
        let rate;
        let bankName;
        if (body.currency !== 'BRL') {
            const converted = await currencyConverter.convertToBRLWithRate(body.amount, body.currency);
            amountBRL = converted.amountBRL;
            rate = converted.rate;
        }
        if (body.targetBankCode) {
            const bank = await (0, shared_1.validateBankCode)(body.targetBankCode);
            bankName = bank.name;
        }
        const debitBRL = amountBRL ?? body.amount;
        if (redis) {
            const key = `${BALANCE_PREFIX}${body.accountId}`;
            const current = await redis.get(key);
            const balance = current !== null ? parseInt(current, 10) : INITIAL_BALANCE;
            if (balance < debitBRL) {
                return reply.status(409).send({
                    message: 'Saldo insuficiente',
                    required: debitBRL,
                    balance,
                });
            }
        }
        const transaction = await (0, submit_transaction_js_1.submitTransaction)(producer, {
            ...body,
            amountBRL,
            rate,
            bankName,
            biometricToken: body.biometricToken,
        });
        return reply.status(201).send(transaction.toJSON());
    });
    app.get('/api/v1/transactions/:id', {
        schema: {
            params: paramsSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        status: { type: 'string', enum: ['PENDING', 'AUTHORIZED', 'DENIED', 'PENDING_SETTLEMENT'] },
                    },
                },
                404: { type: 'object', properties: { message: { type: 'string' } } },
            },
        },
    }, async (request, reply) => {
        return reply.status(200).send({
            id: request.params.id,
            status: 'PENDING',
            message: 'Status is eventually consistent; poll or use result topics for final state.',
        });
    });
}
