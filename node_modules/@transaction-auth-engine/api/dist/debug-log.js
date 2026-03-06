"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLog = debugLog;
/**
 * Fallback debug logging: append NDJSON to .cursor/debug.log for runtime evidence.
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const LOG_PATH = process.env.DEBUG_LOG_PATH ?? path_1.default.join(process.cwd(), '.cursor', 'debug.log');
function debugLog(payload) {
    const line = JSON.stringify({ ...payload, timestamp: payload.timestamp ?? Date.now() }) + '\n';
    try {
        const dir = path_1.default.dirname(LOG_PATH);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.appendFileSync(LOG_PATH, line);
    }
    catch {
        // ignore
    }
}
