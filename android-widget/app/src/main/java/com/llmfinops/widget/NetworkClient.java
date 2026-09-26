package com.llmfinops.widget;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class NetworkClient {
    static final class Row {
        final String name;
        final String provider;
        final String value;
        Row(String name, String provider, String value) {
            this.name = name;
            this.provider = provider;
            this.value = value;
        }
    }

    static final class Summary {
        final List<Row> rows;
        final String openUrl;
        final String updatedAt;
        Summary(List<Row> rows, String openUrl, String updatedAt) {
            this.rows = rows;
            this.openUrl = openUrl;
            this.updatedAt = updatedAt;
        }
    }

    static Summary fetch(Context context) throws Exception {
        String token = Prefs.token(context);
        if (token.trim().isEmpty()) throw new IllegalStateException("请先配置 Widget Token");
        URL url = new URL(Prefs.server(context) + "/api/widget/summary");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(10000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + token);
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        String raw = read(stream);
        connection.disconnect();
        if (status < 200 || status >= 300) {
            String message = "HTTP " + status;
            try { message = new JSONObject(raw).optString("error", message); } catch (Exception ignored) {}
            throw new IllegalStateException(message);
        }
        JSONObject root = new JSONObject(raw);
        JSONArray accounts = root.optJSONArray("accounts");
        List<Row> rows = new ArrayList<>();
        if (accounts != null) {
            for (int i = 0; i < accounts.length(); i++) {
                JSONObject account = accounts.getJSONObject(i);
                JSONArray balances = account.optJSONArray("balances");
                if (balances == null || balances.length() == 0) continue;
                List<String> values = new ArrayList<>();
                for (int j = 0; j < balances.length(); j++) {
                    JSONObject balance = balances.getJSONObject(j);
                    values.add(formatMoney(balance.optDouble("balance", 0), balance.optString("currency", "")));
                }
                rows.add(new Row(account.optString("name", account.optString("provider", "Account")),
                    account.optString("provider", ""), String.join(" · ", values)));
            }
        }
        return new Summary(rows, root.optString("open_url", Prefs.server(context) + "/#overview"),
            root.optString("updated_at", root.optString("generated_at", "")));
    }

    private static String read(InputStream stream) throws Exception {
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder out = new StringBuilder();
            for (String line; (line = reader.readLine()) != null;) out.append(line);
            return out.toString();
        }
    }

    private static String formatMoney(double amount, String currency) {
        String number = Math.abs(amount) >= 100 ? String.format(Locale.US, "%.0f", amount) :
            String.format(Locale.US, "%.2f", amount);
        switch (currency) {
            case "USD": return "US$" + number;
            case "EUR": return "€" + number;
            case "CNY": return "¥" + number;
            default: return currency + " " + number;
        }
    }

    private NetworkClient() {}
}
