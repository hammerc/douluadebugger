import * as os from "os";
import { LuaPrintType } from "../define/LuaDebugDefine";

const FILTER: any = {
    "local": true,
    "function": true,
    "true": true,
    "false": true,
    "do": true,
    "end": true,
    "then": true,
    "nil": true,
    "if": true,
    "while": true,
    "return": true,
    "elseif": true,
    "break": true,
    "for": true,
    "else": true,
    "or": true,
    "and": true,
    "goto": true,
    "not": true
};

const PRINT_TYPE_STR = {
    [LuaPrintType.normal]: "stdout",
    [LuaPrintType.warning]: "console",
    [LuaPrintType.error]: "stderr"
};

/**
 * 工具类
 * @author wizardc
 */
export class LuaDebugUtil {
    /**
     * 获取打印类型
     */
    public static getPrintTypeStr(type: LuaPrintType): string {
        return PRINT_TYPE_STR[type];
    }

    /**
     * 是否是过滤字符串
     */
    public static isFilterStr(v: string): boolean {
        return FILTER[v];
    }

    /**
     * 获取本机 IP
     */
    public static getIPAdress(): string {
        let interfaces = os.networkInterfaces();
        for (let devName in interfaces) {
            let iface = interfaces[devName];
            if (iface) {
                for (let i = 0; i < iface.length; i++) {
                    let alias = iface[i];
                    if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) {
                        return alias.address;
                    }
                }
            }
        }
        return "127.0.0.1";
    }

    /**
     * 获取当前时间字符串
     */
    public static getNowTimeStr(): string {
        return new Date().toLocaleTimeString(undefined, { hour12: false });
    }
}
