package com.example.displayprobe;

import android.app.Activity;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Display;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView tv = new TextView(this);
        tv.setTextSize(16);
        tv.setPadding(24, 24, 24, 24);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(tv);
        setContentView(scroll);

        DisplayManager dm = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        StringBuilder out = new StringBuilder();

        out.append("DiLink Display Probe\n\n");
        out.append("Android: ").append(Build.VERSION.RELEASE)
           .append(" / API ").append(Build.VERSION.SDK_INT).append("\n");
        out.append("Model: ").append(Build.MODEL).append("\n\n");

        if (dm == null) {
            out.append("DisplayManager unavailable\n");
            tv.setText(out.toString());
            return;
        }

        Display[] displays = dm.getDisplays();
        out.append("Logical displays: ").append(displays.length).append("\n");
        out.append("Secondary display visible: ")
           .append(displays.length > 1 ? "YES" : "NO").append("\n\n");

        for (Display d : displays) {
            DisplayMetrics m = new DisplayMetrics();
            d.getRealMetrics(m);

            out.append("Display ID: ").append(d.getDisplayId()).append("\n");
            out.append("Name: ").append(d.getName()).append("\n");
            out.append("Size: ").append(m.widthPixels).append("x")
               .append(m.heightPixels).append("\n");
            out.append("Density DPI: ").append(m.densityDpi).append("\n");
            out.append("Refresh: ").append(d.getRefreshRate()).append(" Hz\n");
            out.append("State: ").append(d.getState()).append("\n");
            out.append("Flags: 0x").append(Integer.toHexString(d.getFlags())).append("\n\n");
        }

        Display[] presentation = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        out.append("Presentation displays: ").append(presentation.length).append("\n");

        tv.setText(out.toString());
    }
}
