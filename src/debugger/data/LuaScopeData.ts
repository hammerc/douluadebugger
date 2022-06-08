import { DebugProtocol } from "vscode-debugprotocol";
import { Handles } from "vscode-debugadapter";
import { LuaDebugSession } from "../session/LuaDebugSession";
import { Command_C2D_GetVariable, Command_C2D_GetScopes } from "./LuaProtoData";
import { LuaVariableData, LuaVariablePathData } from "./LuaDebugData";

const TABLE = "table";
const REPLACE_EXTRA_REGEXP = /\s{1}\[.*?\]/;
const STRUCT_LIST = [
    "locals",
    "watch",
    "ups",
    "global",
    "invalid"
];

/**
 * 作用域类，记录堆栈中某一帧的所有变量
 * @author wizardc
 */
export class LuaScopeData {
    private _core: LuaDebugSession;
    private _data: Command_C2D_GetScopes;

    // table 唯一 id <tbkey, id>
    private _tableRefIds: Map<string, number>;
    // 变量路径 <path, pathData>
    private _loadedPaths: Map<string, LuaVariablePathData>;
    // 变量 <tbkey, <varKey, data>>
    private _loadedVars: Map<string, DebugProtocol.Variable[]>;
    // 是否已加载完整个 table <tbkey, boolean>
    private _isLoadedFullTables: Map<string, boolean>;

    private _handles: Handles<string>;

    public localsStartRefID: number;
    public upsStartRefID: number;
    public globalStartRefID: number;
    public invalidStartRefID: number;
    public watchStartRefID: number;

    public constructor(data: Command_C2D_GetScopes, core: LuaDebugSession) {
        this._data = data;
        this._core = core;

        this._tableRefIds = new Map<string, number>();
        this._loadedPaths = new Map<string, LuaVariablePathData>();
        this._loadedVars = new Map<string, DebugProtocol.Variable[]>();
        this._isLoadedFullTables = new Map<string, boolean>();

        this._handles = new Handles();

        this.localsStartRefID = 0;
        this.upsStartRefID = 0;
        this.globalStartRefID = 0;
        this.invalidStartRefID = 0;
        this.watchStartRefID = 0;

        this.initStruct();
    }

    private initStruct(): void {
        this.localsStartRefID = this.createRef(this._data.struct.locals);
        this.upsStartRefID = this.createRef(this._data.struct.ups);
        this.globalStartRefID = this.createRef(this._data.struct.global);
        this.invalidStartRefID = this.createRef(this._data.struct.invalid);
        this.watchStartRefID = this.createRef(this._data.struct.watch);

        this.addPath("locals", this._data.struct.locals);
        this.addPath("ups", this._data.struct.ups);
        this.addPath("global", this._data.struct.global);
        this.addPath("invalid", this._data.struct.invalid);
        this.addPath("watch", this._data.struct.watch);
    }

    // 创建 table 唯一 id
    private createRef(tbkey: string): number {
        let refId = this._tableRefIds.get(tbkey);
        if (!refId) {
            refId = this._handles.create(tbkey);
            this._tableRefIds.set(tbkey, refId);
        }
        return refId;
    }

    /**
     * 获取 table 地址
     */
    public getTbkey(refID: number): string | undefined {
        if (refID === undefined) {
            return undefined;
        }
        return this._handles.get(refID);
    }

    // 添加路径数据
    private addPath(path: string, tbkey: string, varKey: string | undefined = undefined): void {
        if (!this._loadedPaths.has(path)) {
            this._loadedPaths.set(path, { tbkey: tbkey, varKey: varKey });
        }
    }

    /**
     * 通过 table 唯一 id 找路径
     */
    public getPathByRefId(refID: number): string | undefined {
        let tbkey = this.getTbkey(refID);
        for (let [key, value] of this._loadedPaths) {
            if (value.tbkey === tbkey) {
                return key;
            }
        }
        return undefined;
    }

    /**
     * 获取 table 唯一 id
     */
    public getRefID(tbkey: string): number | undefined {
        return this._tableRefIds.get(tbkey);
    }

    /**
     * 是否已加载完整个 table
     */
    public isLoadedFullTable(tbkey: string): boolean | undefined {
        return this._isLoadedFullTables.get(tbkey);
    }

    /**
     * 通过路径获取变量
     */
    public getVariableByPath(path: string): LuaVariableData | undefined {
        let pathData: LuaVariablePathData | undefined = undefined;

        if (STRUCT_LIST.indexOf(path) === -1) {
            pathData = this._loadedPaths.get(path);
        }

        if (!pathData) {
            // 不是传的全路径，则从全路径缓存中去找值
            for (let prefixKey of STRUCT_LIST) {
                pathData = this._loadedPaths.get(prefixKey + "-" + path);
                if (pathData) {
                    break;
                }
            }
        }

        if (pathData) {
            if (pathData.varKey) {
                let vars = this._loadedVars.get(pathData.tbkey);
                if (vars) {
                    for (let key in vars) {
                        let data = vars[key];
                        if (data.name === pathData.varKey) {
                            return { tbkey: pathData.tbkey, vars: data };
                        }
                    }
                }
            } else {
                let vars = this._loadedVars.get(pathData.tbkey);
                if (vars) {
                    return { tbkey: pathData.tbkey, vars: vars };
                }
            }
        }
    }

    /**
     * 获取 table 变量
     */
    public getTableVar(tbkey: string): DebugProtocol.Variable[] | undefined {
        return this._loadedVars.get(tbkey);
    }

    /**
     * 获取 table 变量
     */
    public getTableVarByRefId(refID: number): DebugProtocol.Variable[] | undefined {
        if (refID !== undefined) {
            let tbkey = this.getTbkey(refID);
            if (tbkey) {
                return this._loadedVars.get(tbkey);
            }
        }
        return undefined;
    }

    /**
     * 加载变量
     */
    public loadVariables(data: Command_C2D_GetVariable): LuaVariableData {
        let tbkey = data.tbkey;
        let path = data.realPath;
        let refId = this.createRef(tbkey);
        let vars = data.vars;
        if (vars.type === TABLE) {
            this.addPath(path, tbkey);
            let variables: DebugProtocol.Variable[] = [];
            this._loadedVars.set(tbkey, variables);
            this._isLoadedFullTables.set(tbkey, true);
            let varList: string[] = [];
            for (let key in vars.var) {
                varList.push(key);
            }
            varList.sort();
            varList.forEach(key => {
                let value = vars.var[key];
                let varPath = path + "-" + this.clearExternalKey(key);
                if (value.type === TABLE) {
                    let newRefId = this.createRef(value.var);
                    variables.push({
                        name: key,
                        type: "",
                        value: value.var,
                        variablesReference: newRefId
                    });
                    this.addPath(varPath, value.var);
                } else {
                    variables.push({
                        name: key,
                        type: value.type,
                        value: value.type === "string" && "\"" + value.var + "\"" || value.var,
                        variablesReference: 0
                    });
                    this.addPath(varPath, tbkey, key);
                }
            });
            return { tbkey: tbkey, vars: variables };
        } else {
            let variables = this.getTableVarByRefId(refId);
            if (!variables) {
                variables = [];
                this._loadedVars.set(tbkey, variables);
            }
            let paths = path.split("-");
            let key = paths[paths.length - 1];
            let value = {
                name: key,
                type: vars.type,
                value: vars.type === "string" && "\"" + vars.var + "\"" || vars.var,
                variablesReference: 0
            };
            variables.push(value);
            this.addPath(path, tbkey, key);
            return { tbkey: tbkey, vars: value };
        }
    }

    // 清除附加参数名
    private clearExternalKey(key: string) {
        return key.replace(REPLACE_EXTRA_REGEXP, "");
    }
}
