---
--- 本调试器目前使用环境如下：
--- Unity + XLua，其中自定义的 CustomLoader 接受的参数是 lua 文件名（无路径和扩展名），
--- 故要求为项目中的所有 Lua 文件都不能出现重名的情况。
---
--- Lua 需要支持 socket 扩展，xlua 中默认已集成；
---
--- 如果接入的项目用法与上面的环境不一致则需要自定义。
---
--- 本插件会挂载到 _G 上的所有对象：
---
--- * DebugRequire : 如果重新赋值过 require 则该变量会记录原始的 require；
--- * LuaDebug : 调试器对象；
--- * debugPrint : 调试器打印消息；
--- * debugPrintWarn : 调试器打印警告消息；
--- * debugPrintErr : 调试器打印错误消息；
--- * debugResume : 原生的未修改 coroutine.resume 方法；
--- * debugWrap : 原生的未修改 coroutine.wrap 方法；
--- * debugSethook : 原生的未修改 coroutine.sethook 方法；
---

DebugRequire = realRequire or require

DebugRequire("DebugPrint")

do

    --region 抓取协程执行信息

    debugResume = coroutine.resume
    debugWrap = coroutine.wrap
    debugSethook = debug.sethook

    local resume = debugResume
    local wrap = debugWrap
    local sethook = debugSethook

    coroutine.resume = function(co, ...)
        if coroutine.status(co) ~= "dead" then
            debug.sethook(co, LuaDebug:getHookFunc(), "lrc")
        end
        return resume(co, ...)
    end

    coroutine.wrap = function(fun)
        local newFun = wrap(function()
            debug.sethook(LuaDebug:getHookFunc(), "lrc")
            return fun();
        end)
        return newFun
    end

    debug.sethook = function(...)
        local debugHook = LuaDebug:getHookFunc()
        local args = { ... }

        if debugHook then
            local newHook = (args[1] and type(args[1]) == "function") and args[1] or args[2]
            if newHook and newHook ~= debugHook then
                debugPrintWarn(debug.traceback("Setting hook functions outside the debugger has invalidated the debugger", 2))
            end
        end

        sethook(...)
    end

    --endregion

end

---Lua 调试器入口
---@author wizardc
---@param host string 地址
---@param port number 端口
return function(host, port)
    if jit then
        DebugRequire("LuaJitDebug")
    else
        DebugRequire("LuaOriginDebug")
    end

    LuaDebug:startDebug(host, port)
end
