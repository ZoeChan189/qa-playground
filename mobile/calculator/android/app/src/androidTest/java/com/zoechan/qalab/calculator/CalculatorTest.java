package com.zoechan.qalab.calculator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.pm.ActivityInfo;
import android.webkit.WebView;
import android.graphics.Bitmap;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONTokener;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.io.File;
import java.io.FileOutputStream;

@RunWith(AndroidJUnit4.class)
public class CalculatorTest {
    @Rule public ActivityScenarioRule<MainActivity> activity = new ActivityScenarioRule<>(MainActivity.class);
    private WebView webView;

    private String script(String source) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch ready = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> webView.evaluateJavascript(source, value -> { result.set(value); ready.countDown(); }));
        assertTrue("WebView JavaScript callback timed out", ready.await(10, TimeUnit.SECONDS));
        return String.valueOf(new JSONTokener(result.get()).nextValue());
    }

    @Before public void waitForCalculator() throws Exception {
        activity.getScenario().onActivity(screen -> webView = screen.getBridge().getWebView());
        long until = System.currentTimeMillis() + 30000;
        while (System.currentTimeMillis() < until) {
            if ("true".equals(script("window.qaCalculatorReady === true && document.getElementById('calc-platform')?.textContent === 'Android'"))) {
                script("document.getElementById('calc-clear').click();document.getElementById('calc-deg').click()");
                return;
            }
            Thread.sleep(250);
        }
        throw new AssertionError("Offline Android calculator did not become ready");
    }

    @Test public void keypadUsesTheSamePrecedenceAsWeb() throws Exception {
        script("['2','add','3','multiply','4'].forEach(k=>document.getElementById('calc-key-'+k).click());document.getElementById('calc-equals').click()");
        assertEquals("14", script("document.getElementById('calc-result').textContent"));
    }

    @Test public void decimalsAndDegreesCalculateCorrectly() throws Exception {
        script("document.getElementById('calc-expression').value='0.1+0.2';document.getElementById('calc-equals').click()");
        assertEquals("0.3", script("document.getElementById('calc-result').textContent"));
        script("document.getElementById('calc-expression').value='sin(30)';document.getElementById('calc-equals').click()");
        assertEquals("0.5", script("document.getElementById('calc-result').textContent"));
    }

    @Test public void dividingByZeroShowsAnErrorWithoutCrashing() throws Exception {
        script("document.getElementById('calc-expression').value='1/0';document.getElementById('calc-equals').click()");
        assertEquals("Error", script("document.getElementById('calc-result').textContent"));
        assertTrue(script("document.getElementById('calc-status').textContent").contains("DIVIDE_BY_ZERO"));
        script("document.getElementById('calc-expression').value='2+3';document.getElementById('calc-equals').click()");
        assertEquals("5", script("document.getElementById('calc-result').textContent"));
    }

    @Test public void allExpectedCasesMatchInsideTheInstalledApk() throws Exception {
        script("document.getElementById('calc-run-cases').click()");
        assertEquals("PASS - 14 / 14 cases matched", script("document.getElementById('calc-case-verdict').textContent"));
        screenshot("calculator-portrait.png");
    }

    @Test public void rotationKeepsTheCurrentCalculation() throws Exception {
        script("document.getElementById('calc-expression').value='(2+3)*4'");
        activity.getScenario().onActivity(screen -> screen.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
        Thread.sleep(1000);
        assertEquals("(2+3)*4", script("document.getElementById('calc-expression').value"));
        script("document.getElementById('calc-equals').click()");
        assertEquals("20", script("document.getElementById('calc-result').textContent"));
        assertEquals("false", script("document.documentElement.scrollWidth>document.documentElement.clientWidth"));
        screenshot("calculator-landscape.png");
    }

    @Test public void keypadTargetsFitTheInstalledAndroidViewport() throws Exception {
        assertEquals("false", script("document.documentElement.scrollWidth>document.documentElement.clientWidth"));
        assertEquals("true", script("Array.from(document.querySelectorAll('.main-keys button,.scientific-keys button')).every(button=>{const box=button.getBoundingClientRect();return box.width>=44&&box.height>=44})"));
    }

    private void screenshot(String name) throws Exception {
        File directory = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "screenshots");
        assertTrue(directory.isDirectory() || directory.mkdirs());
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        try (FileOutputStream stream = new FileOutputStream(new File(directory, name))) {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream));
        } finally { bitmap.recycle(); }
    }
}
