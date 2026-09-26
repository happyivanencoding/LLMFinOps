package com.llmfinops.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BalanceWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.llmfinops.widget.REFRESH";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final int[] ROW_IDS = {R.id.row1,R.id.row2,R.id.row3,R.id.row4,R.id.row5,R.id.row6};
    private static final int[] DOT_IDS = {R.id.dot1,R.id.dot2,R.id.dot3,R.id.dot4,R.id.dot5,R.id.dot6};
    private static final int[] NAME_IDS = {R.id.name1,R.id.name2,R.id.name3,R.id.name4,R.id.name5,R.id.name6};
    private static final int[] VALUE_IDS = {R.id.value1,R.id.value2,R.id.value3,R.id.value4,R.id.value5,R.id.value6};

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAsync(context, goAsync());
    }

    @Override public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            PendingResult pending = goAsync();
            updateAsync(context, pending);
            return;
        }
        super.onReceive(context, intent);
    }

    static void updateAsync(Context context) {
        updateAsync(context, null);
    }

    private static void updateAsync(Context context, PendingResult pending) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try { render(app, NetworkClient.fetch(app), null); }
            catch (Exception e) { render(app, null, e.getMessage()); }
            finally { if (pending != null) pending.finish(); }
        });
    }

    private static void render(Context context, NetworkClient.Summary summary, String error) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, BalanceWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int widgetId : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_balance);
            Intent refresh = new Intent(context, BalanceWidgetProvider.class).setAction(ACTION_REFRESH);
            PendingIntent refreshIntent = PendingIntent.getBroadcast(context, 11, refresh,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.refresh, refreshIntent);

            String openUrl = summary != null ? summary.openUrl : Prefs.server(context) + "/#overview";
            Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(openUrl));
            PendingIntent openIntent = PendingIntent.getActivity(context, 12, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, openIntent);

            if (summary != null) {
                applyRows(views, summary.rows);
                views.setTextViewText(R.id.updated, formatTime(summary.updatedAt));
                views.setViewVisibility(R.id.error, View.GONE);
            } else {
                applyRows(views, java.util.Collections.emptyList());
                views.setTextViewText(R.id.updated, "");
                views.setTextViewText(R.id.error, error == null ? "同步失败" : error);
                views.setViewVisibility(R.id.error, View.VISIBLE);
            }
            manager.updateAppWidget(widgetId, views);
        }
    }

    private static void applyRows(RemoteViews views, List<NetworkClient.Row> rows) {
        for (int i = 0; i < ROW_IDS.length; i++) {
            if (i < rows.size()) {
                NetworkClient.Row row = rows.get(i);
                views.setTextViewText(DOT_IDS[i], "●");
                views.setTextColor(DOT_IDS[i], providerColor(row.provider));
                views.setTextViewText(NAME_IDS[i], row.name);
                views.setTextViewText(VALUE_IDS[i], row.value);
                views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
            } else {
                views.setTextViewText(NAME_IDS[i], "");
                views.setTextViewText(VALUE_IDS[i], "");
                views.setViewVisibility(ROW_IDS[i], View.GONE);
            }
        }
    }

    private static int providerColor(String provider) {
        if (provider == null) return Color.parseColor("#7A8B82");
        switch (provider.toLowerCase(java.util.Locale.ROOT)) {
            case "openai": return Color.parseColor("#3A8A63");
            case "deepseek": return Color.parseColor("#5578C8");
            case "gemini": return Color.parseColor("#7A63D0");
            case "mimo": return Color.parseColor("#D9864F");
            case "jev": return Color.parseColor("#C86591");
            case "codex": return Color.parseColor("#66746D");
            default: return Color.parseColor("#7A8B82");
        }
    }

    private static String formatTime(String iso) {
        if (iso == null || iso.trim().isEmpty()) return "";
        try {
            return OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("HH:mm"));
        } catch (Exception ignored) { return ""; }
    }
}
