export async function onRequestPost(context) {
    try {
        return new Response(JSON.stringify({
            success: false,
            error: "云端部署暂不支持直接保存到本地目录，请使用【打包 ZIP 导出】或【下载此单图】功能！"
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=UTF-8"
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({
            success: false,
            error: err.message
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json;charset=UTF-8"
            }
        });
    }
}
