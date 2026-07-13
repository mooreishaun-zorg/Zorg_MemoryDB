package ai.zorg.lancommandchat;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private static final String PREFS = "lan_command_chat";
    private static final String DEFAULT_URL = "https://lan-command-chat.zorg.local";
    private final ExecutorService network = Executors.newFixedThreadPool(3);
    private SharedPreferences prefs;
    private LinearLayout root, messages, gauges;
    private ScrollView messageScroll;
    private EditText composer;
    private TextView status, detail, themeLabel;
    private String baseUrl;
    private String authCookie;
    private boolean dark;
    private boolean loginShown;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        baseUrl = prefs.getString("url", BuildConfig.DEFAULT_PROFILE_URL);
        if (baseUrl == null || baseUrl.trim().isEmpty()) baseUrl = DEFAULT_URL;
        baseUrl = baseUrl.replaceAll("/chat/?$", "");
        authCookie = prefs.getString("auth_cookie", "");
        applyTheme();
        buildUi();
        refreshAll();
    }

    private void applyTheme() {
        String mode = prefs.getString("theme", "system");
        dark = "dark".equals(mode) || ("system".equals(mode) && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
        getWindow().setStatusBarColor(bg());
        getWindow().setNavigationBarColor(bg());
    }

    private int bg() { return dark ? Color.rgb(8, 15, 27) : Color.rgb(246, 248, 252); }
    private int panel() { return dark ? Color.rgb(18, 30, 48) : Color.WHITE; }
    private int text() { return dark ? Color.rgb(235, 243, 255) : Color.rgb(20, 34, 55); }
    private int muted() { return dark ? Color.rgb(160, 183, 210) : Color.rgb(92, 108, 128); }
    private int accent() { return dark ? Color.rgb(73, 193, 255) : Color.rgb(12, 116, 190); }

    private TextView label(String value, int size) {
        TextView view = new TextView(this);
        view.setText(value); view.setTextColor(text()); view.setTextSize(size); view.setPadding(0, 4, 0, 4);
        return view;
    }
    private Button button(String value) {
        Button button = new Button(this); button.setText(value); button.setTextColor(accent()); button.setAllCaps(false); return button;
    }
    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(18, 14, 18, 14); card.setBackgroundColor(panel());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.setMargins(0, 0, 0, 12); card.setLayoutParams(lp); return card;
    }

    private void buildUi() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(16, 12, 16, 12); root.setBackgroundColor(bg());
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = label("LAN Command Chat", 22); title.setTypeface(Typeface.DEFAULT, Typeface.BOLD); header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button theme = button("Theme"); theme.setOnClickListener(v -> chooseTheme()); header.addView(theme);
        root.addView(header);
        themeLabel = label("Native Android · " + prefs.getString("theme", "system"), 12); themeLabel.setTextColor(muted()); root.addView(themeLabel);
        status = label("Connecting…", 13); status.setTextColor(accent()); root.addView(status);

        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setWeightSum(1);
        LinearLayout chatCard = card(); TextView chatTitle = label("Conversation", 17); chatTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD); chatCard.addView(chatTitle);
        messageScroll = new ScrollView(this); messages = new LinearLayout(this); messages.setOrientation(LinearLayout.VERTICAL); messageScroll.addView(messages); chatCard.addView(messageScroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout compose = new LinearLayout(this); composer = new EditText(this); composer.setHint("Message OpenClaw…"); composer.setTextColor(text()); composer.setHintTextColor(muted()); composer.setSingleLine(false); compose.addView(composer, new LinearLayout.LayoutParams(0, -2, 1));
        Button send = button("Send"); send.setOnClickListener(v -> sendMessage()); compose.addView(send); chatCard.addView(compose); body.addView(chatCard, new LinearLayout.LayoutParams(-1, 0, 1));
        gauges = new LinearLayout(this); gauges.setOrientation(LinearLayout.VERTICAL); body.addView(gauges, new LinearLayout.LayoutParams(-1, -2));
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
    }

    private void addMessage(String who, String body) {
        TextView view = label(who + "\n" + body, 15); view.setTextColor(text()); view.setPadding(12, 10, 12, 10); view.setBackgroundColor(who.equals("You") ? (dark ? Color.rgb(25, 67, 91) : Color.rgb(224, 243, 255)) : (dark ? Color.rgb(31, 43, 62) : Color.rgb(239, 243, 248)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.setMargins(0, 0, 0, 8); messages.addView(view, lp); messageScroll.post(() -> messageScroll.fullScroll(View.FOCUS_DOWN));
    }

    private void sendMessage() {
        String value = composer.getText().toString().trim(); if (value.isEmpty()) return; composer.setText(""); addMessage("You", value); status.setText("Sending…");
        network.execute(() -> { try { JSONObject response = request("/api/chat/send", "POST", new JSONObject().put("message", value).toString()); runOnUiThread(() -> { status.setText("Connected · request accepted"); addMessage("Zorg", "Request accepted. Refreshing conversation…"); }); Thread.sleep(1800); loadHistory(); } catch (Exception e) { if ("AUTH_REQUIRED".equals(e.getMessage())) runOnUiThread(this::showLogin); else runOnUiThread(() -> { status.setText("Connection error"); addMessage("Error", safeMessage(e)); }); } });
    }

    private void refreshAll() { network.execute(() -> { loadHistory(); loadGauges(); }); }
    private void loadHistory() {
        try { JSONObject response = request("/api/chat/history", "GET", null); JSONArray list = response.optJSONArray("messages"); if (list == null) return; runOnUiThread(() -> { messages.removeAllViews(); for (int i = Math.max(0, list.length() - 20); i < list.length(); i++) { JSONObject item = list.optJSONObject(i); if (item == null) continue; String role = item.optString("role", "assistant"); String body = item.optString("text", item.optString("content", "")); if (!body.isEmpty()) addMessage("user".equals(role) ? "You" : "Zorg", body); } status.setText("Connected · live history"); }); } catch (Exception e) { if ("AUTH_REQUIRED".equals(e.getMessage())) runOnUiThread(this::showLogin); else runOnUiThread(() -> status.setText("History unavailable · " + safeMessage(e))); }
    }

    private void loadGauges() {
        try { JSONObject response = request("/api/db/status", "GET", null); JSONObject metrics = response.optJSONObject("metrics"); JSONObject details = response.optJSONObject("details"); runOnUiThread(() -> renderGauges(metrics, details, response)); } catch (Exception e) { if ("AUTH_REQUIRED".equals(e.getMessage())) runOnUiThread(this::showLogin); else runOnUiThread(() -> renderGauges(null, null, new JSONObject())); }
    }

    private void renderGauges(JSONObject metrics, JSONObject details, JSONObject response) {
        gauges.removeAllViews(); LinearLayout card = card(); LinearLayout heading = new LinearLayout(this); TextView title = label("Live system gauges", 17); title.setTypeface(Typeface.DEFAULT, Typeface.BOLD); heading.addView(title, new LinearLayout.LayoutParams(0, -2, 1)); Button brain = button("Memory 3D"); brain.setOnClickListener(v -> showBrain()); heading.addView(brain); card.addView(heading);
        if (metrics == null) { TextView unavailable = label("Live database gauges unavailable. Retry when the service is reachable.", 14); unavailable.setTextColor(Color.rgb(210, 70, 70)); card.addView(unavailable); } else { addMetric(card, "Queries/sec", metric(metrics, "queriesPerSecond")); addMetric(card, "Cache hit", metric(metrics, "cacheHitRatio")); addMetric(card, "Writes/sec", metric(metrics, "writesPerSecond")); addMetric(card, "Database size", metric(metrics, "dbSize")); addMetric(card, "Health", response.optInt("healthScore", 0) + "% · " + (response.optBoolean("degraded") ? "degraded" : "live")); addMetric(card, "Memory", details == null ? "unavailable" : details.optDouble("memoryUsedPercent", 0) + "% used"); }
        Button refresh = button("Refresh live gauges"); refresh.setOnClickListener(v -> loadGauges()); card.addView(refresh); gauges.addView(card);
    }
    private String metric(JSONObject metrics, String key) { JSONObject m = metrics.optJSONObject(key); return m == null ? "unavailable" : m.optString("value", "0") + " " + m.optString("unit", ""); }
    private void addMetric(LinearLayout card, String name, String value) { TextView row = label(name + "  ·  " + value, 14); row.setTextColor(text()); card.addView(row); }

    private void showBrain() {
        setContentView(new BrainView(this)); network.execute(() -> { try { JSONObject graph = requestMemory3d(); runOnUiThread(() -> ((BrainView) findViewById(9001)).setGraph(graph)); } catch (Exception e) { runOnUiThread(() -> Toast.makeText(this, "Memory 3D unavailable: " + safeMessage(e), Toast.LENGTH_LONG).show()); } });
    }
    private JSONObject requestMemory3d() throws Exception { URL url = new URL(memory3dUrl() + "/api/graph"); HttpURLConnection c = (HttpURLConnection) url.openConnection(); c.setConnectTimeout(7000); c.setReadTimeout(12000); c.setRequestMethod("GET"); return new JSONObject(read(c)); }
    private String memory3dUrl() { Uri uri = Uri.parse(baseUrl); String host = uri.getHost(); return (uri.getScheme() == null ? "http" : uri.getScheme()) + "://" + host + ":8097"; }

    private void chooseTheme() { String[] choices = {"System", "Light", "Dark"}; String current = prefs.getString("theme", "system"); int checked = "light".equals(current) ? 1 : "dark".equals(current) ? 2 : 0; new AlertDialog.Builder(this).setTitle("Appearance").setSingleChoiceItems(choices, checked, (dialog, which) -> { prefs.edit().putString("theme", which == 1 ? "light" : which == 2 ? "dark" : "system").apply(); dialog.dismiss(); recreate(); }).setNegativeButton("Cancel", null).show(); }

    private void showLogin() { if (loginShown || isFinishing()) return; loginShown = true; final EditText input = new EditText(this); input.setHint("Password"); input.setInputType(0x81); AlertDialog dialog = new AlertDialog.Builder(this).setTitle("LAN Command Chat login").setMessage("Enter the LAN Chat password to connect securely.").setView(input).setCancelable(false).setNegativeButton("Cancel", (d, w) -> loginShown = false).setPositiveButton("Login", null).create(); dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> { String password = input.getText().toString(); if (password.trim().isEmpty()) return; dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false); network.execute(() -> { try { login(password); runOnUiThread(() -> { loginShown = false; dialog.dismiss(); status.setText("Connected · authenticated"); refreshAll(); }); } catch (Exception error) { runOnUiThread(() -> { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true); Toast.makeText(this, "Login failed: " + safeMessage(error), Toast.LENGTH_LONG).show(); }); } }); })); dialog.show(); }
    private void login(String password) throws Exception { URL url = new URL(join(baseUrl, "/api/auth/login")); HttpURLConnection c = (HttpURLConnection) url.openConnection(); c.setConnectTimeout(8000); c.setReadTimeout(12000); c.setRequestMethod("POST"); c.setRequestProperty("Content-Type", "application/json"); c.setDoOutput(true); try (OutputStream out = c.getOutputStream()) { out.write(new JSONObject().put("password", password).toString().getBytes(StandardCharsets.UTF_8)); } int code = c.getResponseCode(); String result = read(c); if (code < 200 || code >= 300) throw new IOException(new JSONObject(result).optString("error", "HTTP " + code)); String cookie = c.getHeaderField("Set-Cookie"); if (cookie == null || !cookie.contains("lan_chat_auth=")) throw new IOException("Login did not return an auth cookie"); authCookie = cookie.split(";", 2)[0]; prefs.edit().putString("auth_cookie", authCookie).apply(); }
    private JSONObject request(String path, String method, String body) throws Exception { URL url = new URL(join(baseUrl, path)); HttpURLConnection c = (HttpURLConnection) url.openConnection(); c.setConnectTimeout(8000); c.setReadTimeout(20000); c.setRequestMethod(method); c.setRequestProperty("Accept", "application/json"); c.setRequestProperty("Content-Type", "application/json"); if (authCookie != null && !authCookie.isEmpty()) c.setRequestProperty("Cookie", authCookie); if (body != null) { c.setDoOutput(true); try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); } } int code = c.getResponseCode(); String result = read(c); if (code == 401) throw new IOException("AUTH_REQUIRED"); if (code < 200 || code >= 300) throw new IOException("HTTP " + code); return new JSONObject(result); }
    private static String read(HttpURLConnection c) throws Exception { InputStream stream = c.getResponseCode() >= 400 ? c.getErrorStream() : c.getInputStream(); if (stream == null) return "{}"; try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) { StringBuilder value = new StringBuilder(); String line; while ((line = reader.readLine()) != null) value.append(line); return value.toString(); } }
    private static String join(String base, String path) { return base.replaceAll("/+$", "") + "/" + path.replaceAll("^/+", ""); }
    private static String safeMessage(Exception e) { return e.getMessage() == null ? "request failed" : e.getMessage(); }

    private final class BrainView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG); private JSONObject graph = new JSONObject(); private float phase;
        BrainView(Context context) { super(context); setId(9001); setBackgroundColor(bg()); paint.setTypeface(Typeface.DEFAULT); post(new Runnable() { public void run() { phase += .03f; invalidate(); postDelayed(this, 40); }}); }
        void setGraph(JSONObject value) { graph = value; invalidate(); }
        protected void onDraw(Canvas canvas) { super.onDraw(canvas); int w = getWidth(), h = getHeight(); paint.setTextAlign(Paint.Align.CENTER); paint.setColor(text()); paint.setTextSize(28); canvas.drawText("Memory 3D", w / 2f, 60, paint); paint.setTextSize(14); JSONArray nodes = graph.optJSONArray("nodes"); JSONArray links = graph.optJSONArray("links"); int nodeCount = nodes == null ? 0 : nodes.length(); int linkCount = links == null ? 0 : links.length(); canvas.drawText("Live graph · " + nodeCount + " nodes · " + linkCount + " links", w / 2f, 88, paint); if (nodeCount == 0) { paint.setTextSize(16); canvas.drawText("No graph nodes returned by Memory 3D", w / 2f, h / 2f, paint); canvas.drawText("Back to gauges", w / 2f, h - 70, paint); return; } float cx = w / 2f, cy = h / 2f; float radius = Math.min(w, h) * .32f; int renderLimit = Math.min(180, nodeCount); int stride = Math.max(1, (nodeCount + renderLimit - 1) / renderLimit); HashMap<String, PointF> points = new HashMap<>(); int rendered = 0; for (int i = 0; i < nodeCount && rendered < renderLimit; i += stride) { JSONObject node = nodes.optJSONObject(i); if (node == null) continue; String id = node.optString("id", String.valueOf(i)); float angle = phase + rendered * (float)(Math.PI * 2 / Math.max(1, renderLimit)); points.put(id, new PointF(cx + (float)Math.cos(angle) * radius, cy + (float)Math.sin(angle) * radius * .72f)); rendered++; } paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(2); paint.setColor(accent()); if (links != null) for (int i = 0; i < links.length(); i++) { JSONObject link = links.optJSONObject(i); if (link == null) continue; PointF from = points.get(link.optString("source", "")); PointF to = points.get(link.optString("target", "")); if (from != null && to != null) canvas.drawLine(from.x, from.y, to.x, to.y, paint); } paint.setStyle(Paint.Style.FILL); paint.setColor(dark ? Color.rgb(90, 230, 255) : Color.rgb(20, 120, 190)); for (PointF point : points.values()) canvas.drawCircle(point.x, point.y, 7, paint); paint.setColor(text()); paint.setTextSize(13); canvas.drawText("Live memory graph · showing " + rendered + " nodes", cx, cy + 8, paint); paint.setTextSize(16); canvas.drawText("Back to gauges", w / 2f, h - 70, paint); }
        public boolean onTouchEvent(android.view.MotionEvent event) { if (event.getAction() == MotionEvent.ACTION_UP && event.getY() > getHeight() - 140) { buildUi(); loadGauges(); return true; } return true; }
    }
}
