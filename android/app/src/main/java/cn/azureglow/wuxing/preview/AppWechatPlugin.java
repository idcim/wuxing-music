package cn.azureglow.wuxing.preview;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;
import java.security.MessageDigest;

@CapacitorPlugin(name = "AppWechat")
public class AppWechatPlugin extends Plugin {
    private static PluginCall pending;
    private static AppWechatPlugin owner;
    private static String expectedState;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static Runnable timeout;

    @PluginMethod
    public void authorize(PluginCall call) {
        getActivity().runOnUiThread(() -> authorizeOnMain(call));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            rejectPending("已取消微信登录", "CANCELLED");
            call.resolve();
        });
    }

    private void authorizeOnMain(PluginCall call) {
        if (pending != null) { call.reject("微信登录正在进行，请稍候", "BUSY"); return; }
        String appId = call.getString("appId", "");
        String state = call.getString("state", "");
        if (!appId.matches("wx[0-9a-fA-F]{16}") || !state.matches("[0-9a-f]{32}")) {
            call.reject("微信登录参数无效", "INVALID_CONFIG"); return;
        }
        if (!getContext().getPackageName().equals(call.getString("packageName", ""))) {
            call.reject("当前安装包与后台配置包名不一致", "INVALID_PACKAGE"); return;
        }
        try {
            String expected = call.getString("signature", "").replace(":", "").toLowerCase(java.util.Locale.ROOT);
            if (!signatureMd5().equals(expected)) { call.reject("当前安装包签名与后台配置不一致", "INVALID_SIGNATURE"); return; }
        } catch (Exception error) { call.reject("无法检查应用签名", "INVALID_SIGNATURE"); return; }
        // 仅用户主动同意并点击时创建 SDK，不在 Application/启动时初始化。
        IWXAPI api = WXAPIFactory.createWXAPI(getContext(), appId, true);
        if (!api.isWXAppInstalled()) { call.reject("尚未安装微信，请先安装微信或继续游客体验", "NOT_INSTALLED"); return; }
        if (!api.registerApp(appId)) { call.reject("微信登录初始化失败", "REGISTER_FAILED"); return; }
        getContext().getSharedPreferences("app_wechat", 0).edit().putString("app_id", appId).apply();
        SendAuth.Req req = new SendAuth.Req();
        req.scope = "snsapi_userinfo";
        req.state = state;
        pending = call;
        owner = this;
        expectedState = state;
        timeout = () -> rejectPending("微信登录已超时，请重试", "TIMEOUT");
        handler.postDelayed(timeout, 120000);
        if (!api.sendReq(req)) rejectPending("无法打开微信，请重试", "SEND_FAILED");
    }

    @Override
    protected void handleOnDestroy() {
        // Activity销毁时释放桥接调用与超时；旧实例不能取消新实例的授权。
        if (owner == this && pending != null) rejectPending("登录页面已关闭，请重试", "CANCELLED");

    }

    @SuppressWarnings("deprecation")
    private String signatureMd5() throws Exception {
        PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES);
        byte[] digest = MessageDigest.getInstance("MD5").digest(info.signatures[0].toByteArray());
        StringBuilder result = new StringBuilder();
        for (byte value : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    public static void complete(BaseResp response) {
        handler.post(() -> {
            if (pending == null || !(response instanceof SendAuth.Resp)) return;
            SendAuth.Resp auth = (SendAuth.Resp) response;
            if (auth.errCode == BaseResp.ErrCode.ERR_USER_CANCEL) { rejectPending("已取消微信登录", "CANCELLED"); return; }
            if (auth.errCode == BaseResp.ErrCode.ERR_AUTH_DENIED) { rejectPending("已拒绝微信登录，可以继续游客体验", "DENIED"); return; }
            if (auth.errCode != BaseResp.ErrCode.ERR_OK) { rejectPending("微信登录失败，请重试", "AUTH_FAILED"); return; }
            if (!expectedState.equals(auth.state) || auth.code == null || auth.code.isEmpty()) { rejectPending("微信登录校验失败，请重试", "INVALID_STATE"); return; }
            PluginCall call = pending;
            clearPending();
            JSObject result = new JSObject();
            result.put("code", auth.code);
            result.put("state", auth.state);
            call.resolve(result);
        });
    }

    private static void rejectPending(String message, String code) {
        PluginCall call = pending;
        clearPending();
        if (call != null) call.reject(message, code);
    }
    private static void clearPending() {
        if (timeout != null) handler.removeCallbacks(timeout);
        pending = null; owner = null; expectedState = null; timeout = null;
    }
}
