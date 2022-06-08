import * as net from "net";
import { LuaDebugSession } from "./LuaDebugSession";
import { ILuaAttachRequestArguments } from "../data/LuaArgumentsData";
import { DebugProtocol } from "vscode-debugprotocol";
import { LuaDebugUtil } from "../utils/LuaDebugUtil";
import { LuaCommand } from "../define/LuaDebugDefine";

const ATTACH_TIME_OUT = 200;

/**
 * Attach 会话
 * @author wizardc
 */
export class LuaAttachDebugSession extends LuaDebugSession {
    protected attachRequest(response: DebugProtocol.AttachResponse, args: ILuaAttachRequestArguments, request?: DebugProtocol.Request): void {
        this.createServer(response, args);
    }

    protected onCreateServerSuccess(): void {
        this.tryAttach();
    }

    // 尝试主动连接客户端
    private async tryAttach(port: number | undefined = undefined) {
        if (this._supportSocket) {
            return;
        }

        if (!this._debugData) {
            return;
        }

        let debugData = this._debugData as ILuaAttachRequestArguments;

        if (port === undefined) {
            port = debugData.port + 1;
        }

        if (port > debugData.port + 100) {
            return;
        }

        if (debugData.clientHost === "localhost") {
            debugData.clientHost = "127.0.0.1";
        }

        await new Promise((resolve, reject) => {
            if (!port) {
                return;
            }

            let socket: net.Socket;
            socket = net.connect(
                {
                    port: port,
                    host: debugData?.clientHost,
                    timeout: ATTACH_TIME_OUT,
                }
            ).on("connect", () => {
                // this.printConsole(`The debugger connecting to attach server(${this.mDebugData?.clientHost}:${port}) successfully, wait for the attach server connect back to debugger`);
            }).on("error", error => {
                // this.printConsole("Connecting to the attach server error!" + error, 2);

                // 尝试再次连接
                socket.destroy();
                if (!port) {
                    return;
                }
                this.tryAttach(port + 1);
            }).on("timeout", () => {
                // this.printConsole("Connecting to the attach server timeout!", 2);

                // 尝试再次连接
                socket.destroy();
                if (!port) {
                    return;
                }
                this.tryAttach(port + 1);
            }).on("data", (data) => {
                // 通知客户端调试器尝试连接
                let msg = {
                    command: LuaCommand.startDebug,
                    args: {
                        host: LuaDebugUtil.getIPAdress(),
                        port: debugData?.port
                    }
                };
                socket.write(`${JSON.stringify(msg)}\n`);
                socket.destroy();

                // this.printConsole("receive data" + JSON.stringify(msg), 2);
            });
        });
    }
}
