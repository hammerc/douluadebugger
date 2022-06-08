import { DebugProtocol } from "vscode-debugprotocol";

/**
 * 断点数据
 * @author wizardc
 */
export class LuaBreakInfo {
    /**
     * 完整路径
     */
    public fullPath: string;
    /**
     * 行数
     */
    public line: number;
    /**
     * 条件断点
     */
    public condition: string | undefined;
    /**
     * 命中条件断点 n 次后进入断点
     */
    public hitCondition: string | undefined;
    /**
     * 日志
     */
    public logMessage: string | undefined;

    public constructor(fullPath: string, line: number, condition?: string, hitCondition?: string, logMessage?: string) {
        this.fullPath = fullPath;
        this.line = line;
        this.condition = condition;
        this.hitCondition = hitCondition;
        this.logMessage = logMessage;
    }
}

/**
 * 堆栈数据
 * @author wizardc
 */
export interface LuaStackTrackInfo {
    /**
     * 文件名
     */
    fileName: string;
    /**
     * 文件路径
     */
    filePath: string;
    /**
     * 文件行数
     */
    currentline: number;
    /**
     * 方法名
     */
    functionName: string;
}

/**
 * 客户端变量结构
 * @author wizardc
 */
export interface LuaClientVariableStruct {
    type: string;
    var: any;
}

/**
 * 变量数据
 * @author wizardc
 */
export interface LuaVariableData {
    /**
     * table地址
     */
    tbkey: string;
    /**
     * 变量
     */
    vars: DebugProtocol.Variable | DebugProtocol.Variable[];
}

/**
 * 变量地址数据
 * @author wizardc
 */
export interface LuaVariablePathData {
    /**
     * table地址
     */
    tbkey: string;
    /**
     * 变量名
     */
    varKey?: string | undefined;
}
