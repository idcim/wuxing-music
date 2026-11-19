package cn.azureglow.wuxing.preview;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class SplashIconTest {
    @Test public void logoFitsSystemIconAtDifferentBounds() {
        // 系统启动图尺寸按设备缩放；不能把图层锁死为某个 dp 的像素大小。
        for (int resource : new int[] {R.drawable.brand_splash_icon, R.drawable.brand_splash_mark}) {
        for (int size : new int[] {144, 288, 864}) {
            Drawable icon = InstrumentationRegistry.getInstrumentation().getTargetContext()
                .getDrawable(resource);
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            icon.setBounds(0, 0, size, size);
            icon.draw(new Canvas(bitmap));
            int ink = 0;
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
                int pixel = bitmap.getPixel(x, y);
                if (Color.red(pixel) > 180 && Color.green(pixel) > 130 && Color.blue(pixel) < 100) {
                    ink++;
                    double distance = Math.hypot(x + .5 - size / 2.0, y + .5 - size / 2.0);
                    assertTrue("LOGO 超出启动图安全圆，size=" + size, distance < size * .32);
                }
            }
            assertTrue("LOGO 不应消失，size=" + size, ink > size * size * .005);
            bitmap.recycle();
        }
        }
    }
}
