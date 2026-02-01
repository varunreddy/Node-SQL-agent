export class AsyncLocalStorage {
    private store: any = undefined;
    constructor() {
        this.store = undefined;
    }
    disable() {
        this.store = undefined;
    }
    getStore() {
        return this.store;
    }
    run(store: any, callback: () => any) {
        const prev = this.store;
        this.store = store;
        try {
            return callback();
        } finally {
            this.store = prev;
        }
    }
    exit(callback: () => any) {
        return callback();
    }
    enterWith(store: any) {
        this.store = store;
    }
}

export class AsyncResource {
    constructor(type: string, triggerAsyncId?: number) { }
    runInAsyncScope(fn: Function, thisArg: any, ...args: any[]) {
        return fn.apply(thisArg, args);
    }
    emitDestroy() { }
    asyncId() {
        return 0;
    }
    triggerAsyncId() {
        return 0;
    }
}

export function executionAsyncId() {
    return 0;
}

export function triggerAsyncId() {
    return 0;
}

export default {
    AsyncLocalStorage,
    AsyncResource,
    executionAsyncId,
    triggerAsyncId,
};
