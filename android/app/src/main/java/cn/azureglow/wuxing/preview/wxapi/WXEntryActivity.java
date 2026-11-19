package cn.azureglow.wuxing.preview.wxapi;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import cn.azureglow.wuxing.preview.AppWechatPlugin;
import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

public class WXEntryActivity extends Activity implements IWXAPIEventHandler {
    private IWXAPI api;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String appId = getSharedPreferences("app_wechat", 0).getString("app_id", "");
        if (appId.isEmpty()) { finish(); return; }
        api = WXAPIFactory.createWXAPI(this, appId, true);
        handle(getIntent());
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handle(intent);
    }
    private void handle(Intent intent) {
        try { if (api == null || !api.handleIntent(intent, this)) finish(); }
        catch (Exception error) { finish(); }
    }
    @Override public void onReq(BaseReq request) { finish(); }
    @Override public void onResp(BaseResp response) { AppWechatPlugin.complete(response); finish(); }
}
