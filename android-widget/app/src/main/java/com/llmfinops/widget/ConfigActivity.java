package com.llmfinops.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ConfigActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private EditText server;
    private EditText token;
    private TextView backgroundStatus;
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        appWidgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(RESULT_CANCELED, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId));
        }
        buildUi();
    }

    @Override protected void onResume() {
        super.onResume();
        updateBackgroundStatus();
    }

    @Override protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void buildUi() {
        int pad = dp(24);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText("LLMFinOps Widget");
        title.setTextSize(26);
        title.setTextColor(Color.rgb(36,44,41));
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView note = new TextView(this);
        note.setText("在 LLMFinOps → 设置 → Android 桌面 Widget 中显示只读 Token，然后填入这里。");
        note.setTextSize(14);
        note.setTextColor(Color.rgb(84,96,90));
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2);
        noteParams.setMargins(0, dp(12), 0, dp(20));
        root.addView(note, noteParams);

        server = field("服务器地址", Prefs.server(this), false);
        token = field("Widget Token", Prefs.token(this), true);
        root.addView(server);
        root.addView(token);

        backgroundStatus = new TextView(this);
        backgroundStatus.setTextSize(13);
        backgroundStatus.setTextColor(Color.rgb(84,96,90));
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
        statusParams.setMargins(0, dp(4), 0, dp(6));
        root.addView(backgroundStatus, statusParams);

        Button battery = button("允许后台刷新");
        battery.setOnClickListener(v -> requestBackgroundAccess());
        root.addView(battery);

        Button test = button("测试连接");
        test.setOnClickListener(v -> {
            if (!saveValues()) return;
            test.setEnabled(false);
            executor.execute(() -> {
                try {
                    NetworkClient.Summary summary = NetworkClient.fetch(this);
                    runOnUiThread(() -> Toast.makeText(this, "连接成功 · " + summary.rows.size() + " 个余额账户", Toast.LENGTH_LONG).show());
                } catch (Exception e) {
                    runOnUiThread(() -> Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show());
                } finally {
                    runOnUiThread(() -> test.setEnabled(true));
                }
            });
        });
        root.addView(test);

        Button save = button("保存并刷新 Widget");
        save.setOnClickListener(v -> {
            if (!saveValues()) return;
            BalanceWidgetProvider.updateAsync(this);
            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                Intent result = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
                setResult(RESULT_OK, result);
                finish();
            } else Toast.makeText(this, "已保存。现在可以把 LLMFinOps Widget 添加到桌面。", Toast.LENGTH_LONG).show();
        });
        root.addView(save);

        Button open = button("打开 LLMFinOps");
        open.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Prefs.server(this) + "/#overview"))));
        root.addView(open);
        setContentView(root);
    }

    private void updateBackgroundStatus() {
        if (backgroundStatus == null) return;
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        boolean allowed = power != null && power.isIgnoringBatteryOptimizations(getPackageName());
        backgroundStatus.setText(allowed
            ? "后台刷新：已允许"
            : "后台刷新：受系统省电限制。桌面 Widget 可能无法联网。");
        backgroundStatus.setTextColor(allowed ? Color.rgb(54,123,89) : Color.rgb(184,77,85));
    }

    private void requestBackgroundAccess() {
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (power != null && power.isIgnoringBatteryOptimizations(getPackageName())) {
            Toast.makeText(this, "后台刷新已经允许", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            startActivity(new Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getPackageName())
            ));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    private EditText field(String hint, String value, boolean password) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setText(value);
        field.setSingleLine(true);
        if (password) field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(52));
        params.setMargins(0, 0, 0, dp(12));
        field.setLayoutParams(params);
        return field;
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(48));
        params.setMargins(0, dp(6), 0, 0);
        button.setLayoutParams(params);
        return button;
    }

    private boolean saveValues() {
        String url = server.getText().toString().trim();
        if (!url.startsWith("https://")) {
            Toast.makeText(this, "服务器地址必须使用 HTTPS", Toast.LENGTH_LONG).show();
            return false;
        }
        Prefs.save(this, url, token.getText().toString());
        return true;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
