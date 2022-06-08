/**
 * 指令
 * @author wizardc
 */
export const LuaCommand = {
    initialize: "initialize",
    launch: "launch",
    attach: "attach",
    disconnect: "disconnect",
    setBreakpoints: "setBreakpoints",
    start: "start",
    pause: "pause",
    continue: "continue",
    next: "next",
    stepIn: "stepIn",
    stepOut: "stepOut",
    stop: "stop",
    getScopes: "getScopes",
    getVariable: "getVariable",
    watchVariable: "watchVariable",
    printConsole: "printConsole",
    reloadLua: "reloadLua",
    showDialogMessage: "showDialogMessage",
    resetStackInfo: "resetStackInfo",
    startDebug: "startDebug"
};

/**
 * 事件
 * @author wizardc
 */
export const LuaEvent = {
    getFullPath: "getFullPath",
    initDebugEnv: "initDebugEnv",
    reloadLua: "reloadLua",
    showDialogMessage: "showDialogMessage",
    printConsole: "printConsole",
    onReceiveScopes: "onReceiveScopes"
};

/**
 * 打印类型
 * @author wizardc
 */
export const enum LuaPrintType {
    /**
     * 普通
     */
    normal,
    /**
     * 警告
     */
    warning,
    /**
     * 错误
     */
    error
}

/**
 * 错误
 * @author wizardc
 */
export enum LuaErrorDefine {
    Error_1000 = 1000,
}
