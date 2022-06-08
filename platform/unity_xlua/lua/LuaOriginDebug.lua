local extends = DebugRequire("DebugExtends")
local class = extends.class
local DebugBase = DebugRequire("DebugBase")
local DebugUtil = DebugRequire("DebugUtil")

---@class LuaOriginDebug:DebugBase Lua 调试器
---@field _stepInCount number 进入方法的层级数量
local LuaOriginDebug = class("LuaOriginDebug", DebugBase)

function LuaOriginDebug:ctor()
    self.super.ctor(self)
    self._stepInCount = 0
end

function LuaOriginDebug:resetDebugInfo()
    self.super.resetDebugInfo(self)
    self._stepInCount = 0
end

function LuaOriginDebug:debugHook(event, line)
    if not self._supportSocket then
        self:initAttachServerHook()
        return
    end

    --间隔指定时间接收辅助网络消息
    if event == "call" then
        if self._hookCallCount >= 100 then
            self._hookCallCount = 0
            local time = os.clock()
            if time - self._lastReceiveTime > 0.1 then
                self._lastReceiveTime = time
                self:doReceiveSupportSocket()
            end
        else
            self._hookCallCount = self._hookCallCount + 1
        end
    end

    --没有对这一行进行断点则退出
    if self._isInRun and not self._breakLines[line] then
        return
    end

    --维护进入方法的层级数量
    if event == "call" then
        if not self._isInRun then
            self._stepInCount = self._stepInCount + 1
        end
    elseif event == "return" or event == "tail return" then
        if not self._isInRun then
            self._stepInCount = self._stepInCount - 1
        end
    end

    local info = debug.getinfo(2)
    if info.source == "=[C]" or info.source == "[C]" then
        return
    end

    local filePath, fileName = DebugUtil.getFilePathInfo(info.source)

    --需要过滤掉不进断点的文件
    if self._initData and self._initData.filterFiles then
        for _, v in pairs(self._initData.filterFiles) do
            if DebugUtil.comparePath(filePath, v) then
                return
            end
        end
    end

    --正在断点中的处理
    if self._currentStackInfo then
        if event == "line" then
            if self._isStepIn then --单步跳入，进入下一行时直接进断点
                self:hitBreakPoint()
                return
            elseif self._isStepNext then --单步跳过，call 和 return 统计的层数为 0 时进入断点
                if self._stepInCount <= 0 then
                    self:hitBreakPoint()
                    return
                else
                    --查询当前堆栈函数
                    --主要用于在 "pcall" 函数中报错时 call 和 return 不成对的问题，只向上取3位，可能还是存在误差，不过绝大多数情况下够用了
                    local len = #self._currentStackInfo
                    local i = len - 3
                    if i < 1 then
                        i = 1
                    end

                    for j = i, len do
                        local v = self._currentStackInfo[j]
                        if (v.func == info.func) then
                            self:hitBreakPoint()
                            return
                        end
                    end
                end
            end
        end
    end

    --判断是否命中断点
    if event == "line" then
        local breakPoints = self._breakPoints[fileName]
        if breakPoints then
            for _, v in pairs(breakPoints) do
                if v.line == line then
                    if DebugUtil.comparePath(v.fullPath, filePath) then
                        --日志打印
                        if v.logMessage then
                            --执行脚本后返回执行的结果
                            if v.logMessage:len() >= 3 then
                                if v.logMessage:sub(1, 3) == ">>>" then
                                    DebugUtil.executeScript(
                                        string.format("print(%s)", v.logMessage:sub(4, v.logMessage:len()))
                                    )
                                    return
                                end
                            end
                            --直接打印日志
                            local log = string.gsub(v.logMessage, "\"+", "\\\"")
                            DebugUtil.executeScript(string.format("print(%s)", '"' .. log .. '"'))
                            return
                        end
                        --断点条件判断
                        if not v.condition or (v.condition and DebugUtil.executeScript(v.condition)) then
                            self:hitBreakPoint()
                            return
                        end
                    end
                end
            end
        end
    end
end

---@type LuaOriginDebug
local LuaDebug = LuaOriginDebug.new()
xpcall(
    function()
        _G.LuaDebug = LuaDebug
    end,
    function()
        rawset(_G, "LuaDebug", LuaDebug)
    end
)
