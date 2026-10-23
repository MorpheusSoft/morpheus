package com.neo.wms.pda

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.neo.wms.pda/barcode"
    private var methodChannel: MethodChannel? = null
    private val barcodeBuffer = StringBuilder()
    private var lastKeyTime: Long = 0

    private val keyHandler = Handler(Looper.getMainLooper())
    private val burstRunnable = Runnable {
        val code = barcodeBuffer.toString().trim()
        barcodeBuffer.setLength(0)
        if (code.length >= 3) {
            methodChannel?.invokeMethod("onBarcodeScanned", code)
        }
    }

    private val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            val barcode = intent.getStringExtra("data")
                ?: intent.getStringExtra("barcode")
                ?: intent.getStringExtra("SCAN_BARCODE1")
                ?: intent.getStringExtra("scannerdata")
                ?: intent.getStringExtra("barcode_string")
                ?: intent.getStringExtra("value")
                ?: intent.getStringExtra("EXTRA_BARCODE")
            
            if (!barcode.isNullOrBlank()) {
                val clean = barcode.trim()
                runOnUiThread {
                    methodChannel?.invokeMethod("onBarcodeScanned", clean)
                }
            }
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
    }

    override fun onResume() {
        super.onResume()
        val filter = IntentFilter().apply {
            addAction("com.custom.barcode.action")
            addAction("com.scanner.broadcast")
            addAction("android.intent.action.DECODE_DATA")
            addAction("com.android.server.scannerservice.broadcast")
            addAction("scan.rcv.message")
            addAction("com.barcode.sendBroadcast")
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(scanReceiver, filter)
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            unregisterReceiver(scanReceiver)
        } catch (_: Exception) {}
        keyHandler.removeCallbacks(burstRunnable)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val now = System.currentTimeMillis()
            // Si pasaron más de 600ms entre teclas, descartar búfer
            if (now - lastKeyTime > 600) {
                barcodeBuffer.setLength(0)
            }
            lastKeyTime = now

            if (event.keyCode == KeyEvent.KEYCODE_ENTER || 
                event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER || 
                event.keyCode == KeyEvent.KEYCODE_TAB) {
                keyHandler.removeCallbacks(burstRunnable)
                val code = barcodeBuffer.toString().trim()
                barcodeBuffer.setLength(0)
                if (code.length >= 3) {
                    runOnUiThread {
                        methodChannel?.invokeMethod("onBarcodeScanned", code)
                    }
                    return true
                }
            } else {
                val unicode = event.unicodeChar
                if (unicode >= 32) {
                    barcodeBuffer.append(unicode.toChar())
                } else {
                    val num = when (event.keyCode) {
                        KeyEvent.KEYCODE_0, KeyEvent.KEYCODE_NUMPAD_0 -> '0'
                        KeyEvent.KEYCODE_1, KeyEvent.KEYCODE_NUMPAD_1 -> '1'
                        KeyEvent.KEYCODE_2, KeyEvent.KEYCODE_NUMPAD_2 -> '2'
                        KeyEvent.KEYCODE_3, KeyEvent.KEYCODE_NUMPAD_3 -> '3'
                        KeyEvent.KEYCODE_4, KeyEvent.KEYCODE_NUMPAD_4 -> '4'
                        KeyEvent.KEYCODE_5, KeyEvent.KEYCODE_NUMPAD_5 -> '5'
                        KeyEvent.KEYCODE_6, KeyEvent.KEYCODE_NUMPAD_6 -> '6'
                        KeyEvent.KEYCODE_7, KeyEvent.KEYCODE_NUMPAD_7 -> '7'
                        KeyEvent.KEYCODE_8, KeyEvent.KEYCODE_NUMPAD_8 -> '8'
                        KeyEvent.KEYCODE_9, KeyEvent.KEYCODE_NUMPAD_9 -> '9'
                        KeyEvent.KEYCODE_MINUS, KeyEvent.KEYCODE_NUMPAD_SUBTRACT -> '-'
                        KeyEvent.KEYCODE_PERIOD, KeyEvent.KEYCODE_NUMPAD_DOT -> '.'
                        KeyEvent.KEYCODE_SLASH, KeyEvent.KEYCODE_NUMPAD_DIVIDE -> '/'
                        else -> null
                    }
                    if (num != null) {
                        barcodeBuffer.append(num)
                    }
                }

                // Si no hay tecla Enter configurada en la PDA, auto-disparar tras ráfaga (150ms)
                keyHandler.removeCallbacks(burstRunnable)
                keyHandler.postDelayed(burstRunnable, 150)
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
