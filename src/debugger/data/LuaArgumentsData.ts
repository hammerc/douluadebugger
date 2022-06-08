import { DebugProtocol } from "vscode-debugprotocol";

/**
 * 调试器配置
 * @author wizardc
 */
export interface ILuaRequestArguments {
    /**
     * 名称
     */
    name: string;
    /**
     * 类型
     */
    type: string;
    /**
     * 调试模式，Launch 或 Attach
     */
    request: string;
    /**
     * 调试器的端口
     */
    port: number;
    /**
     * print 打印方式 1：控制台和系统输出；2：控制台输出；3：系统输出
     */
    printType: number;
    /**
     * 扩展变量列表（如：查看变量时指向子类可直接查看父类数据，或查看元表二次、多次封装的数据）
     */
    externalVariables: string[];
    /**
     * 过滤文件列表，以下文件不会进入断点
     */
    filterFiles: string[];
}

/**
 * Launch 模式的配置
 * @author wizardc
 */
export interface ILuaLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments, ILuaRequestArguments {
}

/**
 * Attach 模式的配置
 * @author wizardc
 */
export interface ILuaAttachRequestArguments extends DebugProtocol.AttachRequestArguments, ILuaRequestArguments {
    /**
     * 客户端的 IP，用于客户端运行时附加调试的连接
     */
    clientHost: string;
}
