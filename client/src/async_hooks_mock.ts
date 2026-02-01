export class AsyncLocalStorage {
    disable() { }
    getStore() { return undefined; }
    run(_store: any, callback: () => any) { return callback(); }
    exit(callback: () => any) { return callback(); }
    enterWith(_store: any) { }
}
