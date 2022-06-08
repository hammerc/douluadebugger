import { LuaClientVariableStruct } from "./LuaDebugData";

/**
 * Client to Debugger，获取变量域
 * @author wizardc
 */
export interface Command_C2D_GetScopes {
    /**
     * 堆栈索引
     */
    frameId: number;
    /**
     * 数据结构
     */
    struct: {
        locals: string;
        ups: string;
        global: string;
        watch: string;
        invalid: string;
    }
}

/**
 * Client to Debugger，获取变量
 * @author wizardc
 */
export interface Command_C2D_GetVariable {
    /**
     * 请求路径
     */
    path?: string
    /**
     * 堆栈索引
     */
    frameId?: number
    /**
     * 真实路径
     */
    realPath: string
    /**
     * table 地址
     */
    tbkey: string
    /**
     * 变量数据
     */
    vars: LuaClientVariableStruct
}

/**
 * Client to Debugger，监视变量
 * @author wizardc
 */
export interface Command_C2D_WatchVariable {
    /**
     * 表达式
     */
    exp: string
    /**
     * 返回数据
     */
    vars: LuaClientVariableStruct
    /**
     * 真实路径
     */
    realPath: string
    /**
     * table 地址
     */
    tbkey: string
}

/**
 * Debugger to Provider，获取全路径名
 * @author wizardc
 */
export interface Event_D2P_GetFullPath {
    filePath: string;
    idx: number;
}

/**
 * Provider to Debugger，获取全路径名
 * @author wizardc
 */
export interface Event_P2D_GetFullPath {
    fullPath: string;
    idx: number;
}
