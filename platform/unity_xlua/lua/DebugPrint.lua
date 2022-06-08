local Util = DebugRequire("DebugUtil")

local PRINT_TYPE = {
    NORMAL = { type = 0, func = (CS and CS.UnityEngine) and CS.UnityEngine.Debug.Log or print },
    WARNING = { type = 1, func = (CS and CS.UnityEngine) and CS.UnityEngine.Debug.LogWarning or print },
    ERROR = { type = 2, func = (CS and CS.UnityEngine) and CS.UnityEngine.Debug.LogError or print }
}

---消息打印到程序控制台
local function doNormalPrint(typeData, str)
    ---@type S2C_InitializeArgs
    local debugData = LuaDebug and LuaDebug:getDebugData() or nil
    if not debugData or (debugData and (debugData.printType == 1 or debugData.printType == 3)) then
        if typeData.func then
            typeData.func(string.format("<b><color=#999999>[Lua] </color></b>%s\n", str))
        else
            print(str)
        end
    end
end

---消息打印到调试器控制台
local function doConsolePrint(typeData, str)
    ---@type S2C_InitializeArgs
    local debugData = LuaDebug and LuaDebug:getDebugData() or nil
    if not debugData or (debugData and (debugData.printType == 1 or debugData.printType == 2)) then
        if LuaDebug then
            local debugSocket = LuaDebug:getSupportSocket()
            if debugSocket then
                debugSocket:printConsole(str, typeData.type)
            end
        end
    end
end

local function doPrint(type, ...)
    local str = Util.unpackStr(...)
    doNormalPrint(type, str)
    doConsolePrint(type, str)
end

function debugPrint(...)
    doPrint(PRINT_TYPE.NORMAL, ...)
end

function debugPrintWarn(...)
    doPrint(PRINT_TYPE.WARNING, ...)
end

function debugPrintErr(...)
    doPrint(PRINT_TYPE.ERROR, ...)
end
