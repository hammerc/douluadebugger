import { LoggingDebugSession } from "vscode-debugadapter";
import * as vscode_debugadapter from "vscode-debugadapter";
import * as net from "net";
import { LuaBreakInfo, LuaStackTrackInfo, LuaVariableData } from "../data/LuaDebugData";
import { LuaErrorDefine, LuaCommand, LuaEvent, LuaPrintType } from "../define/LuaDebugDefine";
import { LuaScopeData } from "../data/LuaScopeData";
import { DebugProtocol } from "vscode-debugprotocol";
import { LuaDebugUtil } from "../utils/LuaDebugUtil";
import {
    Command_C2D_GetVariable,
    Command_C2D_WatchVariable,
    Command_C2D_GetScopes,
    Event_P2D_GetFullPath
} from "../data/LuaProtoData";
import * as readline from "readline";
import * as path from "path";
import { ILuaRequestArguments } from "../data/LuaArgumentsData";

const WATCH_REGEXP1 = /[:|\.]\s*\w+\(.*?\)\s*$/;
const WATCH_REGEXP2 = /^\s*#\w+/;
const WATCH_REGEXP3 = /^\s*\w+\s*(<|>|<=|>=|==|~=|\+|\-|\*|\/|<<|>>)\s*\w+/;
const WATCH_REGEXP4 = /.+?\[.+?\]\s*$/;
const HOVER_SPLIT_REGEXP = /\w+/g;
const HOVER_IS_NUMBER_REGEXP = /^\d+$/;
const HOVER_IS_STRING_REGEXP = /^\"/;

/**
 * 调试器会话基类
 * @author wizardc
 */
export abstract class LuaDebugSession extends LoggingDebugSession {
    // 断点数据
    private _breakPoints: { [_: string]: LuaBreakInfo[] };
    // 服务器
    private _server: net.Server | undefined;
    // 调试socket
    private _debugSocket: net.Socket | undefined;
    // 辅助socket
    protected _supportSocket: net.Socket | undefined;
    // lua 根目录
    private _luaRoot: string | undefined;
    // 连接索引
    private _clientIndex: number;
    // 是否已初始化
    private _isInited: boolean;
    // 初始化定时器
    private _initTimer: NodeJS.Timer | undefined;
    // 堆栈数据
    private _stackTracks: LuaStackTrackInfo[] | undefined;
    // 变量域数据
    private _scopeDatas: LuaScopeData[];
    // 调试初始化数据
    protected _debugData: ILuaRequestArguments | undefined;
    // 当前frame id
    private _frameId: number;
    // 当前堆栈 id 每次进入断点+1
    private _stackId: number;

    public constructor() {
        super(...arguments);

        this._breakPoints = {};
        this._server = undefined;
        this._debugSocket = undefined;
        this._supportSocket = undefined;
        this._clientIndex = 0;
        this._isInited = false;
        this._initTimer = undefined;
        this._stackTracks = undefined;
        this._scopeDatas = [];
        this._luaRoot = undefined;
        this._frameId = 0;
        this._stackId = 0;

        // 监听未捕获的异常
        process.on("uncaughtException", (err) => {
            this.printConsole("process.uncaughtException:" + err, LuaPrintType.error);
        });
        // 监听 Promise 没有被捕获的失败函数
        process.on("unhandledRejection", (err, promise) => {
            this.printConsole("process.unhandledRejection:" + err, LuaPrintType.error);
        });
    }

    // 显示弹窗消息
    private showDialogMessage(msg: string, type: LuaPrintType): void {
        this.sendEvent(new vscode_debugadapter.Event(LuaEvent.showDialogMessage, { msg: msg, type: type }));
    }

    /**
     * 打印日志
     */
    public printConsole(msg: string, type = LuaPrintType.normal): void {
        if (msg !== undefined) {
            msg = "[" + LuaDebugUtil.getNowTimeStr() + "]: " + msg + "\n";
            this.sendEvent(new vscode_debugadapter.OutputEvent(msg, LuaDebugUtil.getPrintTypeStr(type)));
        }
    }

    // 初始化堆栈
    private initStackTrack(): void {
        this._stackTracks = undefined;
        this._scopeDatas = [];
        this._frameId = 0;
        this._stackId++;
    }

    // 初始化变量域
    private initScope(frameId: number, data: Command_C2D_GetScopes): LuaScopeData {
        let luaScopeData = new LuaScopeData(data, this);
        this._scopeDatas[frameId] = luaScopeData;
        this.setFrameId(frameId);
        return luaScopeData;
    }

    // 设置当前变量域 ID
    private setFrameId(id: number): void {
        this._frameId = id;
    }

    // 准备发送初始化消息到客户端
    private readySendInit(): void {
        if (this._isInited) {
            return;
        }
        if (this._initTimer) {
            clearTimeout(this._initTimer);
        }
        this._initTimer = setTimeout(() => {
            this._initTimer = undefined;
            this._isInited = true;
            this.sendSupportMessage(LuaCommand.initialize, this._debugData);
            this.sendDebugMessage(LuaCommand.initialize);
        }, 200);
    }

    // 创建调试服务器
    protected async createServer(response: DebugProtocol.Response, args: ILuaRequestArguments) {
        await new Promise((resolve, reject) => {
            this._debugData = args;

            setTimeout(
                () => {
                    let server = net.createServer(client => {
                        this.onConnect(client);
                    })
                        .listen(args.port)
                        .on("listening", () => {
                            this.printConsole(`The debugger(${LuaDebugUtil.getIPAdress()}:${args.port}) is ready, wait for client"s connection...`);
                            this.onCreateServerSuccess();
                        })
                        .on("error", err => {
                            this.printConsole("server error, stop debugger", 2);
                            response.success = false;
                            response.message = `${err}`;
                            this.sendResponse(response);
                        });
                    this._server = server;
                    this.sendResponse(response);
                },
                1000
            );
        });
    }

    // 创建服务器成功
    protected onCreateServerSuccess(): void {
    }

    // 与客户端连接成功
    private onConnect(client: net.Socket): void {
        if (this._clientIndex === 0) {
            this._isInited = false;

            if (this._supportSocket !== undefined) {
                this.onSupportSocketClose();
            }

            this._supportSocket = client;

            client.on("end", () => this.onSupportSocketClose())
                .on("close", hadErr => this.onSupportSocketClose())
                .on("error", err => this.onSupportSocketClose());

            this.sendEvent(new vscode_debugadapter.InitializedEvent());
            this.readySendInit();

            this._clientIndex = 1;
        } else if (this._clientIndex === 1) {
            if (this._debugSocket !== undefined) {
                this.onDebugSocketClose();
            }

            this._debugSocket = client;

            client.on("end", () => this.onDebugSocketClose())
                .on("close", hadErr => this.onDebugSocketClose())
                .on("error", err => this.onDebugSocketClose());

            this._clientIndex = 0;
        }

        readline.createInterface({
            input: client,
            output: client
        }).on("line", line => this.onReceiveLine(line));
    }

    // 辅助 socket 关闭
    private onSupportSocketClose() {
        // this.printConsole("Support socket disconnected.");
        if (this._supportSocket) {
            this._supportSocket.removeAllListeners();
            this._supportSocket.end();
            this._supportSocket = undefined;
        }
    }

    // 调试 socket 关闭
    private onDebugSocketClose(): void {
        this.initStackTrack();
        this.printConsole("Debug socket disconnected.");
        if (this._debugSocket) {
            this._debugSocket.removeAllListeners();
            this._debugSocket.end();
            this._debugSocket = undefined;
        }
    }

    /**
     * 来自调试进程断开连接
     */
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        this.initStackTrack();

        this.sendSupportMessage(LuaCommand.stop, args);
        setTimeout(() => {
            if (this._debugSocket !== undefined) {
                this.onDebugSocketClose();
            }
            if (this._supportSocket !== undefined) {
                this.onSupportSocketClose();
            }
        }, 200);
        this.sendResponse(response);
    }

    /**
     * 添加一个安全事件，将对堆栈 id 进行检测，检测不通过则无回调
     * 返回真实监听回调，用作外部自定义移除
     */
    public addSafeEvent(eventName: string, isOnce: boolean, func: (args: any) => void, errorFunc: (() => void) | undefined = undefined) {
        let stackId = this._stackId;
        let listener = (retArgs: any) => {
            if (!this._stackTracks || this._stackId !== stackId) {
                // this.printConsole("addSafeEvent return : " + eventName);
                this.removeListener(eventName, listener);
                if (errorFunc) {
                    errorFunc();
                }
                return;
            }
            func(retArgs);

            if (isOnce) {
                this.removeListener(eventName, listener);
            }
        };
        this.on(eventName, listener);
        return listener;
    }

    /**
     * 发送辅助 socket 消息
     */
    public sendSupportMessage(cmd: string, args: any): void {
        if (this._supportSocket) {
            let msg = {
                command: cmd,
                args: args || ""
            };
            this._supportSocket.write(`${JSON.stringify(msg)}\n`);
        }
    }

    /**
     * 发送调试 socket 消息
     */
    public sendDebugMessage(cmd: string, args?: any): void {
        if (this._debugSocket) {
            let msg = {
                command: cmd,
                args: args || ""
            };
            this._debugSocket.write(`${JSON.stringify(msg)}\n`);
        }
    }

    /**
     * 发送断点信息
     */
    public sendBreakpoints(breaks: { [_: string]: LuaBreakInfo[] }): void {
        breaks = breaks || this._breakPoints;
        let args = {
            breakPoints: breaks,
        };

        this.sendDebugMessage(LuaCommand.setBreakpoints, args);
        this.sendSupportMessage(LuaCommand.setBreakpoints, args);
    }

    // 接收数据
    private onReceiveLine(input: string): void {
        let data = JSON.parse(input);
        let cmd = data.command;
        let args = data.arguments;
        if (cmd === LuaCommand.printConsole) {
            this.printConsole(args.msg, args.type);
        } else {
            if (cmd === LuaCommand.pause) {
                this.onReceivePause(args);
            } else if (cmd === LuaCommand.showDialogMessage) {
                this.showDialogMessage(args.msg, args.type);
            } else if (cmd === LuaCommand.resetStackInfo) {
                this.initStackTrack();
            } else if (cmd === LuaCommand.getScopes) {
                this.emit(LuaCommand.getScopes + args.frameId, args);
            } else if (cmd === LuaCommand.getVariable) {
                this.emit(LuaCommand.getVariable + args.frameId + args.path, args);
            } else if (cmd === LuaCommand.watchVariable) {
                this.emit(LuaCommand.watchVariable + args.frameId + args.exp, args);
            } else {
                this.emit(cmd, args);
            }
        }
    }

    // 接收到暂停
    private onReceivePause(args: any): void {
        this._stackTracks = args;
        this.sendEvent(new vscode_debugadapter.StoppedEvent("breakpoint", 1));
    }

    /**
     * 跨进程事件接收
     */
    protected customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request): void {
        if (command === LuaCommand.printConsole) {
            // args.type: LuaPrintType
            this.printConsole(args.msg, args.type);
        } else if (command === LuaEvent.reloadLua) {
            if (this._supportSocket) {
                this.sendSupportMessage(LuaCommand.reloadLua, { luaPath: args.luaPath, fullPath: args.fullPath });
            } else {
                this.showDialogMessage("重载失败，调试器未连接到客户端", 2);
            }
        } else {
            this.emit(command, args);
        }
    }

    /**
     * 来自调试进程初始化调试请求(启动调试器)
     */
    protected async initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments) {
        await new Promise((resolve, reject) => {
            let onInitDebugEnv = (data: any) => {
                this.removeListener(LuaEvent.initDebugEnv, onInitDebugEnv);

                this._luaRoot = data.luaRoot;
                response.body = response.body || {};
                response.body.supportsFunctionBreakpoints = true;
                response.body.supportsConditionalBreakpoints = true;
                response.body.supportsHitConditionalBreakpoints = true;
                response.body.supportsLogPoints = true;
                response.body.supportsEvaluateForHovers = true;
                this.sendResponse(response);
            };
            this.on(LuaEvent.initDebugEnv, onInitDebugEnv);
            this.sendEvent(new vscode_debugadapter.Event(LuaEvent.initDebugEnv));
        });
    }

    /**
     * 来自调试进程断点变化
     */
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): void {
        let source = args.source;
        if (source && source.path) {
            let filePath = path.normalize(source.path).replace(/\\/g, "/");
            let bps = args.breakpoints || [];
            let bpsProto: LuaBreakInfo[] = [];
            let bpsResp = [];
            for (let i = 0; i < bps.length; i++) {
                let bp = bps[i];
                bpsProto.push(new LuaBreakInfo(
                    filePath,
                    bp.line,
                    bp.condition,
                    bp.hitCondition,
                    bp.logMessage
                ));
                let bpResp = new vscode_debugadapter.Breakpoint(true, bp.line);
                bpsResp.push(bpResp);
            }

            let idx = filePath.lastIndexOf("/") + 1;
            let pointIdx = filePath.lastIndexOf(".");
            if (pointIdx === -1) {
                pointIdx = filePath.length;
            }

            let shortFilePath = filePath.substring(idx, pointIdx);
            let cache = this._breakPoints[shortFilePath];
            if (cache) {
                let idx = 0;
                while (idx < cache.length) {
                    if (cache[idx].fullPath === filePath) {
                        cache.splice(idx, 1);
                    } else {
                        idx++;
                    }
                }
                bpsProto.forEach(element => {
                    if (cache) {
                        cache.push(element);
                    }
                });
            } else {
                this._breakPoints[shortFilePath] = bpsProto;
                cache = bpsProto;
            }
            response.body = { breakpoints: bpsResp };

            this.sendBreakpoints(
                { [shortFilePath]: cache }
            );
            this.readySendInit();
        }

        this.sendResponse(response);
    }

    /**
     * 来自调试进程
     */
    protected threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request): void {
        response.body = {
            threads: [
                new vscode_debugadapter.Thread(1, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    /**
     * 来自调试进程堆栈分析(发起暂停，开始调试)
     */
    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request) {
        if (!this._stackTracks) {
            return;
        }

        let stacks = this._stackTracks;

        await new Promise((resolve, reject) => {
            let stackFrames: vscode_debugadapter.StackFrame[] = [];

            let listener = this.addSafeEvent(LuaEvent.getFullPath,
                false,
                (data: Event_P2D_GetFullPath) => {
                    let fullPath = data.fullPath;
                    let idx = data.idx;
                    let stack = stacks[idx];
                    let source = new vscode_debugadapter.Source(stack.fileName, fullPath);
                    stackFrames.push(new vscode_debugadapter.StackFrame(idx, stack.functionName, source, stack.currentline));

                    if (idx === stacks.length - 1) {
                        this.removeListener(LuaEvent.getFullPath, listener);
                        response.body = {
                            stackFrames: stackFrames,
                            totalFrames: stackFrames.length
                        };
                        this.sendResponse(response);
                    }
                },
                () => {
                    this.sendResponse(response);
                }
            );

            for (let i = 0; i < stacks.length; i++) {
                let stack = stacks[i];
                this.sendEvent(new vscode_debugadapter.Event(LuaEvent.getFullPath, { filePath: stack.filePath, idx: i }));
            }
        });
    }

    /**
     * 来自调试进程作用域分析(选中某个堆栈)
     */
    protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request) {
        if (!this._stackTracks) {
            return;
        }

        let handler = (luaScopeData: LuaScopeData) => {
            response.body = {
                scopes: [{
                    name: "Local",
                    variablesReference: luaScopeData.localsStartRefID,
                    expensive: false
                },
                {
                    name: "Ups",
                    variablesReference: luaScopeData.upsStartRefID,
                    expensive: false
                },
                {
                    name: "Global",
                    variablesReference: luaScopeData.globalStartRefID,
                    expensive: false
                },
                    // {
                    //     name: "Invalid",
                    //     variablesReference: luaScopeData.invalidStartRefID,
                    //     expensive: false
                    // },
                    // {
                    //     name: "Watch",
                    //     variablesReference: luaScopeData.watchStartRefID,
                    //     expensive: false
                    // },
                ]
            };

            this.sendResponse(response);
            this.emit(LuaEvent.onReceiveScopes, args.frameId);
        };

        let LuaScopeData = this._scopeDatas[args.frameId];
        if (LuaScopeData) {
            handler(LuaScopeData);
        } else {
            await new Promise((resolve, reject) => {
                let frameId = args.frameId;
                this.sendDebugMessage(LuaCommand.getScopes, { frameId: frameId });

                this.addSafeEvent(LuaCommand.getScopes + frameId, true,
                    (data: Command_C2D_GetScopes) => {
                        handler(this.initScope(frameId, data));
                    },
                    () => {
                        this.sendResponse(response);
                    }
                );
            });
        }
    }

    /**
     * 来自调试进程变量请求
     */
    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request) {
        let sendExpiredResponse = () => {
            response.body = {
                variables: [{
                    name: "error",
                    type: "object",
                    value: "Expired value",
                    variablesReference: 0
                }]
            };
            this.sendResponse(response);
        };

        if (!this._stackTracks) {
            sendExpiredResponse();
            return;
        }

        let frameId = this._frameId;
        let LuaScopeData = this._scopeDatas[frameId];
        if (!LuaScopeData) {
            sendExpiredResponse();
            return;
        }

        let tbkey = LuaScopeData.getTbkey(args.variablesReference);
        if (!tbkey) {
            response.body = {
                variables: [{
                    name: "error",
                    type: "object",
                    value: "error! not find tbkey",
                    variablesReference: 0
                }]
            };
            this.sendResponse(response);
            return;
        }

        if (LuaScopeData.isLoadedFullTable(tbkey)) {
            let vars = LuaScopeData.getTableVarByRefId(args.variablesReference);
            if (vars && vars.length > 0) {
                response.body = {
                    variables: vars,
                };
            } else {
                response.body = {
                    variables: [{
                        name: "{}",
                        value: "",
                        variablesReference: 0,
                        presentationHint: { kind: "property" },
                    }]
                };
            }

            this.sendResponse(response);
        } else {
            let path = LuaScopeData.getPathByRefId(args.variablesReference);
            if (!path) {
                response.body = {
                    variables: [{
                        name: "error",
                        type: "error",
                        value: "error! not find path",
                        variablesReference: 0
                    }]
                };
                this.sendResponse(response);
                return;
            }
            await new Promise((resolve, reject) => {
                this.sendDebugMessage(LuaCommand.getVariable, { frameId: frameId, path: path });

                this.addSafeEvent(LuaCommand.getVariable + frameId + path, true,
                    (data: Command_C2D_GetVariable) => {
                        if (this._frameId !== frameId) {
                            this.sendResponse(response);
                            return;
                        }

                        let varData = LuaScopeData.loadVariables(data);
                        let vars = varData.vars;
                        if (vars instanceof Array) {
                            if (vars.length > 0) {
                                response.body = {
                                    variables: vars,
                                };
                            } else {
                                response.body = {
                                    variables: [{
                                        name: "{}",
                                        value: "",
                                        variablesReference: 0,
                                        presentationHint: { kind: "property" },
                                    }]
                                };
                            }
                        } else {
                            response.body = {
                                variables: [vars]
                            };
                        }

                        this.sendResponse(response);
                    },
                    sendExpiredResponse
                );
            });
        }
    }

    /**
     * 来自调试进程评估请求(鼠标悬浮到文字上、监视)
     */
    protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request) {
        if (args.frameId === undefined) {
            this.printConsole("evaluateRequest not find frameId", LuaPrintType.error);
            return;
        }

        let sendExpiredResponse = () => {
            response.body = {
                result: "Expired value",
                type: "object",
                variablesReference: 0,
                presentationHint: { kind: "property" }
            };
            this.sendResponse(response);
        };

        let LuaScopeData = this._scopeDatas[args.frameId];
        if (!LuaScopeData) {
            if (this._stackTracks) {
                // 用于监视变量时，scopeData获取次序不对的情况
                await new Promise((resolve, reject) => {
                    this.addSafeEvent(LuaEvent.onReceiveScopes, true,
                        (frameId) => {
                            if (frameId !== args.frameId) {
                                this.sendResponse(response);
                                return;
                            }
                            this.evaluateRequest(response, args);
                        }, sendExpiredResponse);
                });
            } else {
                sendExpiredResponse();
            }
            return;
        }

        this.setFrameId(args.frameId);

        let showEvaluateVariables = (varData: LuaVariableData) => {
            let vars = varData.vars;
            let tbkey = varData.tbkey;
            if (vars instanceof Array) {
                if (LuaScopeData.isLoadedFullTable(tbkey)) {
                    let refID = LuaScopeData.getRefID(tbkey);
                    if (refID) {
                        response.body = {
                            result: tbkey,
                            variablesReference: refID,
                        };
                        this.sendResponse(response);
                        return true;
                    } else {
                        this.printConsole("Error " + LuaErrorDefine.Error_1000, LuaPrintType.error);
                    }
                }
            } else {
                response.body = {
                    result: vars.value,
                    type: vars.type,
                    variablesReference: 0,
                    presentationHint: { kind: "property" }
                };
                this.sendResponse(response);
                return true;
            }
        };

        // 来自监视并且是lua算法表达式
        if (args.context === "watch" && (WATCH_REGEXP1.test(args.expression) || WATCH_REGEXP2.test(args.expression)) || WATCH_REGEXP3.test(args.expression) || WATCH_REGEXP4.test(args.expression)) {
            // 先读缓存
            let varData = LuaScopeData.getVariableByPath(args.expression);
            if (varData && showEvaluateVariables(varData)) {
                return;
            }

            this.sendDebugMessage(LuaCommand.watchVariable, { frameId: args.frameId, exp: args.expression });
            this.addSafeEvent(LuaCommand.watchVariable + args.frameId + args.expression, true,
                (data: Command_C2D_WatchVariable) => {
                    if (this._frameId !== args.frameId) {
                        sendExpiredResponse();
                        return;
                    }

                    let variable = {
                        realPath: data.realPath,
                        tbkey: data.tbkey,
                        vars: data.vars
                    };

                    let varData = LuaScopeData.loadVariables(variable);
                    showEvaluateVariables(varData);
                },
                sendExpiredResponse
            );
        } else {
            // 过滤特殊字符
            let path: string | undefined = args.expression;

            let isNumber = HOVER_IS_NUMBER_REGEXP.test(path);
            let isString = HOVER_IS_STRING_REGEXP.test(path);
            if (isNumber || isString || LuaDebugUtil.isFilterStr(path)) {
                let type;
                if (isNumber) {
                    type = "number";
                } else if (isString) {
                    path = path + "\"";
                    type = "string";
                } else {
                    type = "object";
                }
                response.body = {
                    result: path,
                    type: type,
                    variablesReference: 0,
                    presentationHint: { kind: "property" }
                };
                this.sendResponse(response);
                return;
            }

            let match = path.matchAll(HOVER_SPLIT_REGEXP);
            path = undefined;
            for (let iterator of match) {
                if (!path) {
                    path = iterator[0];
                } else {
                    path = path + "-" + iterator[0];
                }
            }

            if (!path) {
                response.body = {
                    result: "Not find path, origin expression is:" + args.expression,
                    type: "object",
                    variablesReference: 0,
                    presentationHint: { kind: "property" }
                };
                this.sendResponse(response);
                return;
            }

            // 先读缓存
            let varData = LuaScopeData.getVariableByPath(path);
            if (varData && showEvaluateVariables(varData)) {
                return;
            }

            await new Promise((resolve, reject) => {
                this.sendDebugMessage(LuaCommand.getVariable, { frameId: args.frameId, path: path });

                this.addSafeEvent(LuaCommand.getVariable + args.frameId + path, true,
                    (data: Command_C2D_GetVariable) => {
                        if (this._frameId !== args.frameId) {
                            sendExpiredResponse();
                            return;
                        }

                        let varData = LuaScopeData.loadVariables(data);
                        showEvaluateVariables(varData);
                    }, sendExpiredResponse
                );
            });
        }
    }

    /**
     * 来自调试进程暂停
     */
    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request) {
        this.sendDebugMessage(LuaCommand.pause);
        this.sendResponse(response);
    }

    /**
     * 来自调试进程继续
     */
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request) {
        this.initStackTrack();

        this.sendDebugMessage(LuaCommand.continue);
        this.sendResponse(response);
    }

    /**
     * 来自调试进程单步跳过
     */
    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request) {
        this.initStackTrack();

        this.sendDebugMessage(LuaCommand.next);
        this.sendResponse(response);
    }

    /**
     * 来自调试进程单步跳入
     */
    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request) {
        this.initStackTrack();

        this.sendDebugMessage(LuaCommand.stepIn);
        this.sendResponse(response);
    }

    /**
     * 来自调试进程单步跳出
     */
    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request) {
        this.initStackTrack();

        this.sendDebugMessage(LuaCommand.stepOut);
        this.sendResponse(response);
    }
}
