"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSwagger = registerSwagger;
const swagger_1 = __importDefault(require("@fastify/swagger"));
const swagger_ui_1 = __importDefault(require("@fastify/swagger-ui"));
async function registerSwagger(app) {
    const enableSwaggerUi = String(process.env.ENABLE_SWAGGER_UI ?? '').toLowerCase() === 'true';
    await app.register(swagger_1.default, {
        openapi: {
            info: {
                title: 'Transaction Auth Engine API',
                description: 'REST API for submitting and querying transaction authorization',
                version: '1.0.0',
            },
            servers: [{ url: 'http://localhost:3000', description: 'Local' }],
        },
    });
    if (enableSwaggerUi) {
        await app.register(swagger_ui_1.default, {
            routePrefix: '/api-docs',
            uiConfig: {
                docExpansion: 'list',
                deepLinking: true,
            },
        });
    }
}
