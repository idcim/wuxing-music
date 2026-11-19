package cn.azureglow.wuxing.preview;

import android.os.Bundle;
import android.os.Build;
import android.os.SystemClock;
import android.animation.ValueAnimator;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        // 原生开屏与 WebView 并行准备；仅首次创建保留一轮短动画，不在回前台重播。
        final long animationDeadline = SystemClock.uptimeMillis() + (Build.VERSION.SDK_INT >= 31 && savedInstanceState == null && ValueAnimator.areAnimatorsEnabled() ? getResources().getInteger(R.integer.brand_splash_duration_ms) : 0);
        splash.setKeepOnScreenCondition(() -> SystemClock.uptimeMillis() < animationDeadline);
        registerPlugin(AppWechatPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
