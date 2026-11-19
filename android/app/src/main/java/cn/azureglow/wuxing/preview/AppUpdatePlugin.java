package cn.azureglow.wuxing.preview;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 在系统浏览器下载 APK，由用户自行确认安装，不申请安装应用权限。 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    @PluginMethod
    public void openDownload(PluginCall call) {
        String address = call.getString("url", "");
        Uri uri = Uri.parse(address);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || uri.getPath() == null || !uri.getPath().matches("/api/app/download/[a-f0-9]{32}")) {
            call.reject("下载地址无效");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("请先安装浏览器后重试", error);
        }
    }
}
