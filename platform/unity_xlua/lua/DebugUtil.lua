local LuaDebugUtil = CS.LuaDebugUtil

---@class DebugUtil 工具类
local DebugUtil = {}

local filePathCachePaths = {}
local compareStrCache = {}
local compareCache = {}

---@type table<string, string> C# 基础数据类型和 lua 对照表
local CSHARP_BASE_VALUE = {
    ["System.Boolean"] = "boolean",
    ["System.Char"] = "string",
    ["System.String"] = "string",
    ["System.Int16"] = "number",
    ["System.Int32"] = "number",
    ["System.Int64"] = "number",
    ["System.IntPtr"] = "number",
    ["System.Byte"] = "number",
    ["System.Byte[]"] = "string",
    ["System.SByte"] = "number",
    ["System.UInt16"] = "number",
    ["System.UInt32"] = "number",
    ["System.UInt64"] = "number",
    ["System.UIntPtr"] = "number",
    ["System.Decimal"] = "number",
    ["System.Single"] = "number",
    ["System.Double"] = "number",
    ["Method"] = "function",
    ["null"] = "nil",
}

---设置指定函数的执行环境，第二个参数传入的表会成为第一个参数的"_G"环境
---如果传入的环境没有 print 方法，则调用会报没有 print 方法的错
---lua5.1 以上没有这个函数了，需要自己实现
local setfenv = setfenv

if (not setfenv) then
    ---自己实现核心如下，最顶层的 "_ENV" 是一个 upvalue，通过方法 debug.upvaluejoin 将指定函数的 "_ENV" 的上值替换为
    ---另一个函数的上值即可
    setfenv = function(fn, env)
        local i = 1
        while true do
            ---取上值的名称
            local name = debug.getupvalue(fn, i)
            ---找到该方法最顶层的 "_ENV" 的上值索引
            if name == "_ENV" then
                ---将该方法的 "_ENV" 上值替换为传入的环境表
                debug.upvaluejoin(
                    fn,
                    i,
                    (function()
                        ---这里是将 env 设定为该方法的上值，且该方法只有一个编号为 1 的上值 env
                        return env
                    end),
                    1
                )
                break
            elseif DebugUtil.isNil(name) then
                ---遍历结束的退出
                break
            end
            i = i + 1
        end
        return fn
    end
end

---安全设置 table 属性
function DebugUtil.rawset(tb, key, value)
    xpcall(
        function()
            tb[key] = value
        end,
        function()
            xpcall(
                function()
                    tb[tonumber(key)] = value
                end,
                function()
                    rawset(tb, key, value)
                end
            )
        end
    )
end

---合并两个 table
function DebugUtil.tableMerge(dst, src)
    for k, v in pairs(src) do
        DebugUtil.rawset(dst, k, v)
    end
end

---分割字符串
---@param text string 需要分割字符串
---@param sep string 匹配字符串，支持模式匹配
---@param plain boolean 是否开启模式匹配，默认关闭，可省略
---@param base_zero boolean 返回数组是否按照下标0位开始，默认下标1位开始，可省略
---@return string[]
function DebugUtil.strSplit(text, sep, plain, base_zero)
    ---@type string[]
    local result = {}
    if text and type(text) == type("") then
        local searchPos = 1
        local idx = base_zero and 0 or 1
        while true do
            local matchStart, matchEnd = string.find(text, sep, searchPos, plain)
            if matchStart and matchEnd >= matchStart then
                result[idx] = string.sub(text, searchPos, matchStart - 1)
                idx = idx + 1
                searchPos = matchEnd + 1
            else
                result[idx] = string.sub(text, searchPos)
                break
            end
        end
    end
    return result
end

---xpcall 简单封装
function DebugUtil.xpcall(func)
    xpcall(
        func,
        function(msg)
            printErr(msg .. "\n" .. debug.traceback())
        end
    )
end

---获取 table 地址
function DebugUtil.getTbKey(var)
    if type(var) == "userdata" and DebugUtil.isLoadedLuaDebugUtil() then
        return LuaDebugUtil.GetTbKey(var)
    else
        return tostring(var)
    end
end

---判空
function DebugUtil.isNil(obj)
    if obj == nil then
        return true
    end
    if type(obj) == "userdata" and LuaDebugUtil.IsDestroy(obj) then
        return true
    end
    return false
end

---是否是 c# 表
function DebugUtil.isCSharpTable(var)
    local a
    DebugUtil.xpcall(function()
        a = (type(var) == "userdata" and not CSHARP_BASE_VALUE[var:GetType():ToString()])
    end)
    return a
end

---是否加载 c# 调试工具
function DebugUtil.isLoadedLuaDebugUtil()
    if LuaDebugUtil then
        local ret
        xpcall(
            function()
                LuaDebugUtil.GetTbKey("")
                ret = true
            end,
            function()
                ret = false
            end
        )
        return ret
    end
    return false
end

---反向查找
function DebugUtil.lastFind(str, k)
    local ts = string.reverse(str)
    local _, i = string.find(ts, k)
    if i then
        i = string.len(ts) - i + 1
        return i
    end
end

---获取路径详情
function DebugUtil.getFilePathInfo(file)
    if filePathCachePaths[file] then
        return filePathCachePaths[file][1], filePathCachePaths[file][2], filePathCachePaths[file][3]
    end

    local fileName = nil

    file = file:gsub("/.\\", "/")
    file = file:gsub("\\", "/")
    file = file:gsub("//", "/")
    if file:find("@") == 1 then
        file = file:sub(2)
    end

    local findex = file:find("%./")
    if findex == 1 then
        file = file:sub(3)
    end

    local idx = DebugUtil.lastFind(file, "/")
    if idx then
        fileName = file:sub(idx + 1, file:len())
    else
        fileName = file
    end

    local surfixName
    local pointIdx = fileName:find("%.")
    if pointIdx then
        surfixName = fileName:sub(pointIdx, file:len())
        fileName = fileName:sub(1, fileName:find("%.") - 1)
    else
        surfixName = ".lua"
        file = file .. surfixName
    end

    filePathCachePaths[file] = {
        file,
        fileName,
        surfixName
    }
    return file, fileName, surfixName
end

---获取当前堆栈的变量
local function getStackValue(f)
    --获取 local 变量
    local i = 1
    local locals = {}
    while true do
        local name, value = debug.getlocal(f, i)

        if DebugUtil.isNil(name) then
            break
        end

        if name ~= "(*temporary)" then
            locals[name] = value
        end

        i = i + 1
    end

    --获取上值变量
    i = 1
    local ups = {}
    --获取 func 函数避免在末次调用时其被置空后报错
    local func = debug.getinfo(f, "f").func
    while func do
        local name, value = debug.getupvalue(func, i)

        if DebugUtil.isNil(name) then
            break
        end

        if name == "_ENV" then
            ups["_ENV_"] = value
        else
            ups[name] = value
        end

        i = i + 1
    end

    return { locals = locals, ups = ups }
end

---获取堆栈
---@return StackInfo[]
function DebugUtil.getStackInfo(ignoreCount, isFindVar)
    local ret = {}
    --堆栈向上找最多 100 次
    for i = ignoreCount, 100 do
        local source = debug.getinfo(i)

        if DebugUtil.isNil(source) then
            break
        end

        local file = source.source

        if file ~= "=[C]" and file ~= "[C]" then
            local filePath, fileName, surfixName = DebugUtil.getFilePathInfo(file)

            local info = {
                fileName = fileName,
                filePath = filePath,
                currentline = source.currentline,
                linedefined = source.linedefined,
                lastlinedefined = source.lastlinedefined,
                functionName = source.name,
                func = source.func
            }

            if isFindVar then
                info.vars = getStackValue(i + 1)
            end

            table.insert(ret, info)
        end

        if source.what == "main" then
            break
        end
    end

    return ret
end

---创建变量域对象，用于发送给调试器
---@return ScopeInfo
function DebugUtil.loadScopes()
    local scopeData = {}

    local stackInfo = LuaDebug:getCurrentStackInfo()[LuaDebug:getCurrentFrameId() + 1].vars
    stackInfo.global = _G
    stackInfo.invalid = {}
    stackInfo.watch = {}

    scopeData.struct = {}
    for k, v in pairs(stackInfo) do
        scopeData.struct[k] = tostring(v)
    end

    return scopeData
end

---解析 c# 对象为 VariableData
---@param csharpVar userdata
---@return table<string, VariableData>
function DebugUtil.ParseCSharpValue(csharpVar)
    local varInfos = {}
    if DebugUtil.isLoadedLuaDebugUtil() then
        if csharpVar then

            ---@param field CSharp_ValueInfo
            local function createCSharpVariable(field)
                local type = CSHARP_BASE_VALUE[field.valueType]
                if type then
                    varInfos[field.key] = { type = type, var = field.valueStr }
                else
                    varInfos[field.key] = { type = "table", var = DebugUtil.getTbKey(field.value) }
                end
            end

            ---@type CSharp_ValueInfo
            local fields = LuaDebugUtil.ParseCSharpValue(csharpVar)
            for i = 1, fields.Count do
                local field = fields[i - 1]
                createCSharpVariable(field)
            end
        end
    else
        varInfos = DebugUtil.createVariable("读取C#变量失败，请确定LuaDebugUtil.cs文件在项目工程中并启动")
    end

    return varInfos
end

---过滤特殊不可见字符
function DebugUtil.filterSpecChar(s)
    local ss = {}
    local k = 1
    while true do
        if k > #s then
            break
        end
        local c = string.byte(s, k)
        if DebugUtil.isNil(c) then
            break
        end
        if c < 192 then
            if c >= 32 and c <= 126 then
                table.insert(ss, string.char(c))
            else
                table.insert(ss, "?")
            end
            k = k + 1
        elseif c < 224 then
            k = k + 2
        elseif c < 240 then
            if c >= 228 and c <= 233 then
                local c1 = string.byte(s, k + 1)
                local c2 = string.byte(s, k + 2)
                if c1 and c2 then
                    local a1, a2, a3, a4 = 128, 191, 128, 191
                    if c == 228 then
                        a1 = 184
                    elseif c == 233 then
                        a2, a4 = 190, c1 ~= 190 and 191 or 165
                    end
                    if c1 >= a1 and c1 <= a2 and c2 >= a3 and c2 <= a4 then
                        table.insert(ss, string.char(c, c1, c2))
                    else
                        table.insert(ss, "#")
                    end
                end
            end
            k = k + 3
        elseif c < 248 then
            k = k + 4
        elseif c < 252 then
            k = k + 5
        elseif c < 254 then
            k = k + 6
        else
            k = k + 1
        end
    end
    return table.concat(ss)
end

---创建变量数据
---@param v any
---@return VariableData
function DebugUtil.createVariable(v)
    if v == nil then
        return { type = "nil", var = "nil" }
    else
        local type = type(v)
        if type == "table" or DebugUtil.isCSharpTable(v) then
            return { type = "table", var = DebugUtil.getTbKey(v) }
        elseif type == "userdata" then
            return { type = CSHARP_BASE_VALUE[v:GetType():ToString()], var = v:ToString() }
        elseif type == "string" then
            v = DebugUtil.filterSpecChar(tostring(v))
            return { type = "string", var = v }
        else
            return { type = type, var = tostring(v) }
        end
    end
end

---安全获取 table 变量
function DebugUtil.rawget(tb, key)
    if key == nil then
        return nil
    end
    local ret
    xpcall(
        function()
            ret = tb[key]
        end,
        function()
            xpcall(
                function()
                    ret = tb[tonumber(key)]
                end,
                function()
                    ret = rawget(tb, key)
                end
            )
        end
    )
    return ret
end

---获取变量
function DebugUtil.getVariable(path)
    local scopeInfo = LuaDebug:getScopeInfo()
    local ret = { type = "nil", var = "nil" }
    local realPath = path
    local retTbkey
    if scopeInfo then
        retTbkey = tostring(scopeInfo.struct.invalid)
    end

    DebugUtil.xpcall(
        function()
            local frameId = LuaDebug:getCurrentFrameId()
            local vars = LuaDebug:getCurrentStackInfo()[frameId + 1].vars
            local debugData = LuaDebug:getDebugData()

            ---将配置中的 externalVariables 的属性也抓取给到 tb，这里一般是取元表的数据，比如子类对象把父类的属性也获取一下
            local function loadExtraVar(var, tb)
                for i, v in ipairs(debugData.externalVariables) do
                    local newVar = DebugUtil.rawget(var, v)
                    if newVar then
                        if type(newVar) == "table" then
                            for k2, v2 in pairs(newVar) do
                                if DebugUtil.isNil(DebugUtil.rawget(tb, k2)) then
                                    DebugUtil.rawset(tb, k2, v2)
                                end
                            end

                            loadExtraVar(newVar, tb)
                        else
                            if DebugUtil.isNil(DebugUtil.rawget(tb, v)) then
                                DebugUtil.rawset(tb, v, newVar)
                            end
                        end
                    end
                end
            end

            ---查询表 var 的属性 k
            local function getVar(var, k)
                if DebugUtil.isNil(var) then
                    return nil
                end

                if type(var) == "table" then
                    --正常查询
                    local v = DebugUtil.rawget(var, k)
                    if DebugUtil.isNil(v) then
                        v = DebugUtil.rawget(var, tonumber(k))
                    end
                    --查询扩展数据
                    if DebugUtil.isNil(v) then
                        local tb = {}
                        loadExtraVar(var, tb)
                        v = tb[k]
                        if not v then
                            v = tb[tonumber(k)]
                        end
                    end
                    return v
                elseif DebugUtil.isCSharpTable(var) and DebugUtil.isLoadedLuaDebugUtil() then
                    return LuaDebugUtil.GetCSharpValue(var, k)
                end

                return nil
            end

            --将待查询的变量节点进行拆分
            local paths = DebugUtil.strSplit(path, "-")
            ---根据需要查询的层级地址查询出最终的值
            ---@return any, string 需要查询的值，最后的 table 地址
            local function findVar(var)
                --获取 table 地址
                local tbkey = DebugUtil.getTbKey(var)
                --按照路径层级逐级下查
                for k, v in ipairs(paths) do
                    local nextVar = getVar(var, v)
                    if not DebugUtil.isNil(nextVar) then
                        if type(nextVar) ~= "table" and not DebugUtil.isCSharpTable(nextVar) and k ~= #paths then
                            var = nil
                            tbkey = nil
                            break
                        else
                            if type(nextVar) == "table" or DebugUtil.isCSharpTable(nextVar) then
                                tbkey = DebugUtil.getTbKey(nextVar)
                            end
                            var = nextVar
                        end
                    else
                        var = nil
                        tbkey = nil
                        break
                    end
                end

                return var, tbkey
            end

            local isFindOgiPath = scopeInfo.struct[paths[1]] and true or false
            local var
            local tbkey
            if isFindOgiPath then
                var, tbkey = findVar(vars)
            else
                --重新构造 table，以定义查找顺序
                local varTb = {
                    { k = "locals", v = vars.locals },
                    { k = "ups", v = vars.ups },
                    { k = "global", v = vars.global },
                    { k = "watch", v = vars.watch },
                    { k = "invalid", v = vars.invalid }
                }
                for k, v in ipairs(varTb) do
                    var, tbkey = findVar(v.v)
                    if not DebugUtil.isNil(var) then
                        realPath = v.k .. "-" .. path
                        break
                    end
                end
            end

            local realVar = var
            if not DebugUtil.isNil(realVar) then
                if type(realVar) == "table" then
                    ret = { type = "table", var = {} }
                    for k, v in pairs(realVar) do
                        ret.var[tostring(k)] = DebugUtil.createVariable(v)
                    end
                    DebugUtil.findExtraVars(ret.var, realVar)
                elseif DebugUtil.isCSharpTable(realVar) then
                    ret = { type = "table", var = DebugUtil.ParseCSharpValue(realVar) }
                elseif type(realVar) == "userdata" then
                    ret = { type = CSHARP_BASE_VALUE[realVar:GetType():ToString()], var = realVar:ToString() }
                else
                    ret = DebugUtil.createVariable(realVar)
                end
                retTbkey = tbkey
            end
        end
    )

    return ret, retTbkey, realPath
end

---监视变量
function DebugUtil.watchVariable(exp)
    local frameId = LuaDebug:getCurrentFrameId()
    local vars = LuaDebug:getCurrentStackInfo()[frameId + 1].vars

    local fun = load("return " .. exp)

    local env = {}
    for k, v in pairs(vars.locals) do
        env[k] = v
    end

    for k, v in pairs(vars.ups) do
        if DebugUtil.isNil(env[k]) then
            env[k] = v
        end
    end

    for k, v in pairs(vars.global) do
        if DebugUtil.isNil(env[k]) then
            env[k] = v
        end
    end

    local ret
    xpcall(
        function()
            setfenv(fun, env)
            ret = { fun() }
        end,
        function(msg)
            ret = nil
        end
    )
    if ret then
        if #ret == 1 then
            return ret[1]
        else
            return ret
        end
    end
end

---查看额外变量
---@param ret table 存储表
---@param var table 目标表
function DebugUtil.findExtraVars(ret, var)
    if type(ret) ~= "table" or type(var) ~= "table" then
        return
    end

    local cacheKeys = {}
    for k, v in pairs(ret) do
        cacheKeys[k] = true
    end

    local getExtraVars
    getExtraVars = function(tb, key, prefix)
        local newVar = DebugUtil.rawget(tb, key)
        if newVar then
            if type(newVar) == "table" then
                for k, v in pairs(newVar) do
                    if DebugUtil.isNil(cacheKeys[k]) then
                        local newKey
                        if prefix then
                            newKey = k .. " [" .. prefix .. "." .. key .. "]"
                        else
                            newKey = k .. " [" .. key .. "]"
                        end

                        cacheKeys[k] = true
                        DebugUtil.rawset(ret, newKey, DebugUtil.createVariable(v))
                    end
                end

                getExtraVars(newVar, key, prefix and prefix .. "." .. key or key)
            elseif DebugUtil.isNil(cacheKeys[key]) then
                local newKey
                if prefix then
                    newKey = key .. " [" .. prefix .. "." .. key .. "]"
                else
                    newKey = key .. " [" .. key .. "]"
                end

                cacheKeys[key] = true
                DebugUtil.rawset(ret, newKey, DebugUtil.createVariable(newVar))
            end
        end
    end

    local debugData = LuaDebug:getDebugData()
    for _, key in ipairs(debugData.externalVariables) do
        getExtraVars(var, key)
    end
end

---将多个参数字符串连接起来
function DebugUtil.unpackStr(...)
    local arg = table.pack(...)
    if #arg == 0 then
        arg = { "nil" }
    else
        for k, v in pairs(arg) do
            if v == nil then
                arg[k] = "nil"
            else
                local tp = type(v)
                if tp ~= "number" and tp ~= "string" then
                    arg[k] = tostring(v)
                end
            end
        end
    end

    local sIdx = next(arg)
    for i = 1, sIdx do
        if arg[i] == nil then
            arg[i] = "nil"
        end
    end

    return table.concat(arg, "\t")
end

---重载lua文件
---@param data S2C_ReloadLuaArgs
function DebugUtil.reloadLua(data)
    DebugUtil.xpcall(
        function()
            local luaPath = data.luaPath
            local oldValue = package.loaded[luaPath]
            if DebugUtil.isNil(oldValue) then
                local idx = DebugUtil.lastFind(luaPath, "%.")
                if idx then
                    luaPath = luaPath:sub(idx + 1, luaPath:len())
                    oldValue = package.loaded[luaPath]
                end
            end

            if oldValue then
                package.loaded[luaPath] = nil
                local realTab = DebugUtil.require(luaPath)
                tableMerge(oldValue, realTab)

                LuaDebug:getSupportSocket():showDialogMessage("重载成功")
            else
                LuaDebug:getSupportSocket():showDialogMessage("重载失败，文件未被加载", 2)
            end
        end
    )
end

---比较两个 path
function DebugUtil.comparePath(path1, path2)
    local k = path1 .. path2
    if compareCache[k] ~= nil then
        return compareCache[k]
    else
        local path1Tb
        local path1Len
        local path2Tb
        local path2Len

        local cache = compareStrCache[path1]
        if cache then
            path1Tb = cache[1]
            path1Len = cache[2]
        else
            path1Tb = DebugUtil.strSplit(path1, "/")
            path1Len = #path1Tb
            cache = {
                path1Tb,
                path1Len
            }
            compareStrCache[path1] = cache
        end

        cache = compareStrCache[path2]
        if cache then
            path2Tb = cache[1]
            path2Len = cache[2]
        else
            path2Tb = DebugUtil.strSplit(path2, "/")
            path2Len = #path2Tb
            cache = {
                path2Tb,
                path2Len
            }
            compareStrCache[path2] = cache
        end

        local ret
        while true do
            if path1Tb[path1Len] ~= path2Tb[path2Len] then
                ret = false
                break
            end

            path1Len = path1Len - 1
            path2Len = path2Len - 1
            if path1Len == 0 or path2Len == 0 then
                ret = true
                break
            end
        end

        compareCache[k] = ret
        return ret
    end
end

---执行代码
function DebugUtil.executeScript(conditionStr, level)
    level = level or 4
    local ret
    local vars = getStackValue(level)
    local env = {}
    local locals = vars.locals
    local ups = vars.ups
    local global = _G

    if (locals) then
        for k, v in pairs(locals) do
            env[k] = v
        end
    end

    if (ups) then
        for k, v in pairs(ups) do
            if DebugUtil.isNil(env[k]) then
                env[k] = v
            end
        end
    end

    for k, v in pairs(global) do
        if DebugUtil.isNil(env[k]) then
            env[k] = v
        end
    end

    local fun = load("return " .. conditionStr)

    xpcall(
        function()
            setfenv(fun, env)
            ret = fun()
        end,
        function(msg)
            local info = debug.getinfo(level + 3)
            printErr("表达式错误：" .. "from [" .. info.source .. "]:" .. info.currentline .. "\n" .. msg)
        end
    )
    return ret
end

return DebugUtil
