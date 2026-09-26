package com.llmfinops.widget;

import android.content.Context;
import android.content.SharedPreferences;

final class Prefs {
    private static final String NAME = "llmfinops_widget";
    private static final String DEFAULT_URL = "https://finops.thegreatnovel.com";

    static SharedPreferences store(Context context) {
        return context.getSharedPreferences(NAME, Context.MODE_PRIVATE);
    }

    static String server(Context context) {
        String value = store(context).getString("server", DEFAULT_URL);
        if (value == null || value.trim().isEmpty()) return DEFAULT_URL;
        return value.trim().replaceAll("/+$", "");
    }

    static String token(Context context) {
        String value = store(context).getString("token", "");
        return value == null ? "" : value.trim();
    }

    static void save(Context context, String server, String token) {
        store(context).edit()
            .putString("server", server.trim().replaceAll("/+$", ""))
            .putString("token", token.trim())
            .apply();
    }

    private Prefs() {}
}
