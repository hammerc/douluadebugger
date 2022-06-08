import { LuaDebugSession } from "./LuaDebugSession";
import { DebugProtocol } from "vscode-debugprotocol";
import { ILuaLaunchRequestArguments } from "../data/LuaArgumentsData";

/**
 * Launch 会话
 * @author wizardc
 */
export class LuaLaunchDebugSession extends LuaDebugSession {
    protected launchRequest(response: DebugProtocol.LaunchResponse, args: ILuaLaunchRequestArguments, request?: DebugProtocol.Request): void {
        this.createServer(response, args);
    }
}
