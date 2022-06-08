using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using XLua;
using Object = System.Object;

/// <summary>
/// CS 对象的值
/// </summary>
public class CSharpValue
{
    /// <summary>
    /// 属性名称
    /// </summary>
    public string key;
    /// <summary>
    /// 属性值
    /// </summary>
    public Object value;
    /// <summary>
    /// 属性值的字符串描述
    /// </summary>
    public string valueStr;
    /// <summary>
    /// 属性值的类型
    /// </summary>
    public string valueType;
    /// <summary>
    /// table 表的地址
    /// </summary>
    public string tbkey = "null 0";
}

/// <summary>
/// Lua 调试器工具类
/// </summary>
[LuaCallCSharp]
public static class LuaDebugUtil
{
    private const BindingFlags PROPERTY_FLAG = BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Static;
    private const BindingFlags FIELD_FLAG = BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Static;
    private const BindingFlags METHOD_FLAG = BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Static;

    private static bool _inited = false;

    /// <summary>
    /// 初始化
    /// </summary>
    [CSharpCallLua]
    public static void Init(LuaFunction func)
    {
        if (_inited)
        {
            return;
        }
        _inited = true;

        Application.wantsToQuit += () =>
        {
            try
            {
                func.Call();
                func.Dispose(true);
                func = null;
                return true;
            }
            catch (Exception e)
            {
                return true;
            }
        };
    }

    /// <summary>
    /// 判断 C# 对象是否销毁
    /// </summary>
    public static bool IsDestroy(System.Object obj) {
        return obj == null;
    }

    /// <summary>
    /// 取 C# 对象的值
    /// </summary>
    public static Object GetCSharpValue(Object obj, String key)
    {
        var list = ParseCSharpValue(obj);
        foreach (var value in list)
        {
            if (value.key == key)
            {
                return value.value;
            }
        }
        return null;
    }

    /// <summary>
    /// 取 C# 对象的地址
    /// </summary>
    public static string GetTbKey(Object obj)
    {
        return obj.ToString() + " " + obj.GetHashCode();
    }

    /// <summary>
    /// 解析一个 C# 对象并得到该对象的所有值
    /// </summary>
    public static List<CSharpValue> ParseCSharpValue(Object obj)
    {
        var ret = new List<CSharpValue>();

        var type = obj.GetType();
        // 判断是否是数组
        if (type.IsArray)
        {
            var array = (Array)obj;
            var i = 0;
            foreach (var value in array)
            {
                var name = "[" + i + "]";
                PushCSharpValue(ret, value, name);
                i++;
            }
            return ret;
        }

        // 判断是否是泛型
        if (type.IsGenericType)
        {
            if (type.GetInterface("IDictionary") != null)
            {
                ParseDictionary(obj, ret);
            }
            else
            {
                ParseList(obj, ret);
            }
        }

        if (type == typeof(ArrayList))
        {
            var arrayList = (ArrayList)obj;
            var i = 0;
            foreach (var value in arrayList)
            {
                var name = "[" + i + "]";
                PushCSharpValue(ret, value, name);
                i++;
            }
            return ret;
        }

        if (type == typeof(Hashtable))
        {
            var map = (Hashtable)obj;
            foreach (DictionaryEntry o in map)
            {
                var name = "[" + o.Key + "]";
                var value = o.Value;
                PushCSharpValue(ret, value, name);
            }
        }

        var infos = type.GetProperties(PROPERTY_FLAG);
        foreach (var info in infos)
        {
            var name = info.Name;
            if (name == "Item") continue;

            try
            {
                var value = info.GetValue(obj, null);
                PushCSharpValue(ret, value, name);
            }
            catch (Exception e)
            {
                PushExceptionCSharpValue(ret, e, name);
            }
        }

        var fields = type.GetFields(FIELD_FLAG);
        foreach (var field in fields)
        {
            var name = field.Name;
            try
            {
                var value = field.GetValue(obj);
                PushCSharpValue(ret, value, name);
            }
            catch (Exception e)
            {
                PushExceptionCSharpValue(ret, e, name);
            }
        }

        var methods = type.GetMethods(METHOD_FLAG);
        foreach (var method in methods)
        {
            var name = method.Name;
            try
            {
                PushCSharpValue(ret, method, name, "Method");
            }
            catch (Exception e)
            {
                PushExceptionCSharpValue(ret, e, name);
            }
        }

        return ret;
    }

    private static void PushCSharpValue(List<CSharpValue> ret, Object value, string name, string valueType = null)
    {
        valueType = valueType ?? value.GetType().ToString();
        var valueStr = value.ToString();
        if (valueStr != null && valueStr != "" && valueStr != "null" && valueStr != "\0")
        {
            ret.Add(new CSharpValue()
            {
                key = name,
                value = value,
                valueStr = valueStr,
                valueType = valueType,
                tbkey = GetTbKey(value)
            });
        }
    }

    private static void PushExceptionCSharpValue(List<CSharpValue> ret, Exception e, string name)
    {
        if (e.InnerException == null) return;
        var error = e.InnerException.Message;
        ret.Add(new CSharpValue()
        {
            key = name,
            value = error,
            valueStr = error,
            valueType = typeof(Object).ToString(),
        });
    }

    private static void ParseList(Object obj, List<CSharpValue> ret)
    {
        var type = obj.GetType();
        var count = Convert.ToInt32(type.GetProperty("Count")?.GetValue(obj, null));
        var itemPro = type.GetProperty("Item");
        if (itemPro == null) return;
        for (var i = 0; i < count; i++)
        {
            var name = "[" + i + "]";
            var value = itemPro.GetValue(obj, new Object[] { i });
            PushCSharpValue(ret, value, name);
        }
    }

    private static void ParseDictionary(Object obj, List<CSharpValue> ret)
    {
        var type = obj.GetType();
        var keyInfo = type.GetProperty("Keys");
        var valueInfo = type.GetProperty("Values");
        if (keyInfo == null || valueInfo == null) return;

        var keyValues = new ArrayList(keyInfo.GetValue(obj, null) as ICollection);
        var valValues = new ArrayList(valueInfo.GetValue(obj, null) as ICollection);

        for (var i = 0; i < keyValues.Count; i++)
        {
            var name = "[" + keyValues[i] + "]";
            var value = valValues[i];
            PushCSharpValue(ret, value, name);
        }
    }
}
