package com.neo.wms.pda

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    private val CHANNEL = "com.neo.wms.pda/barcode"
    private var methodChannel: MethodChannel? = null
    private val barcodeBuffer = StringBuilder()
    private var lastKeyTime: Long = 0

    // Native invisible EditText that holds Android InputConnection focus
    // with showSoftInputOnFocus = false so the PDA scanner ALWAYS reads
    // into a focused TextBox while NEVER opening the virtual keyboard.
    private var scannerEditText: EditText? = null
    private var scannerModeEnabled: Boolean = true
    private var isClearingScannerText: Boolean = false

    private var lastEmittedCode: String = ""
    private var lastEmittedTime: Long = 0

    private val keyHandler = Handler(Looper.getMainLooper())

    private val burstRunnable = Runnable {
        val code = barcodeBuffer.toString().trim()
        barcodeBuffer.setLength(0)
        if (code.isNotEmpty()) {
            emitBarcode(code)
        }
    }

    private val editTextBurstRunnable = Runnable {
        val raw = scannerEditText?.text?.toString() ?: ""
        val clean = raw.replace("\n", "").replace("\r", "").trim()
        clearScannerEditText()
        if (clean.isNotEmpty()) {
            emitBarcode(clean)
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
                ?: intent.getStringExtra("scan_result")
                ?: intent.getStringExtra("barcode_data")
                ?: intent.getStringExtra("scan_data")
                ?: intent.getStringExtra("string")
                ?: intent.getStringExtra("text")
                ?: intent.getStringExtra("barcodedata")

            if (!barcode.isNullOrBlank()) {
                emitBarcode(barcode.trim())
            }
        }
    }

    private fun emitBarcode(rawCode: String) {
        val clean = rawCode.trim()
        if (clean.isEmpty()) return
        val now = System.currentTimeMillis()
        if (clean == lastEmittedCode && (now - lastEmittedTime) < 300) {
            return
        }
        lastEmittedCode = clean
        lastEmittedTime = now
        runOnUiThread {
            methodChannel?.invokeMethod("onBarcodeScanned", clean)
            if (scannerModeEnabled) {
                ensureScannerFocusAndHideKeyboard()
            }
        }
    }

    private fun clearScannerEditText() {
        val edit = scannerEditText ?: return
        isClearingScannerText = true
        try {
            edit.setText("")
        } catch (_: Exception) {
        } finally {
            isClearingScannerText = false
        }
    }

    private fun setupScannerEditText(): EditText? {
        if (scannerEditText != null) return scannerEditText
        val contentGroup = window?.decorView?.findViewById<ViewGroup>(android.R.id.content) ?: return null

        val edit = EditText(this).apply {
            layoutParams = FrameLayout.LayoutParams(2, 2, Gravity.TOP or Gravity.START)
            alpha = 0.01f
            visibility = View.VISIBLE
            isFocusable = true
            isFocusableInTouchMode = true
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_DONE or EditorInfo.IME_FLAG_NO_EXTRACT_UI
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                showSoftInputOnFocus = false
            }

            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    if (isClearingScannerText || s == null) return
                    val raw = s.toString()
                    if (raw.isEmpty()) return

                    if (raw.contains('\n') || raw.contains('\r') || raw.contains('\t')) {
                        keyHandler.removeCallbacks(editTextBurstRunnable)
                        val clean = raw.replace("\n", "").replace("\r", "").replace("\t", "").trim()
                        clearScannerEditText()
                        if (clean.isNotEmpty()) {
                            emitBarcode(clean)
                        }
                    } else {
                        keyHandler.removeCallbacks(editTextBurstRunnable)
                        keyHandler.postDelayed(editTextBurstRunnable, 110)
                    }
                }
            })

            setOnEditorActionListener { _, actionId, event ->
                val isEnterEvent = event != null && (
                    event.keyCode == KeyEvent.KEYCODE_ENTER ||
                    event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
                    event.keyCode == KeyEvent.KEYCODE_TAB
                )
                if (actionId == EditorInfo.IME_ACTION_DONE ||
                    actionId == EditorInfo.IME_ACTION_NEXT ||
                    actionId == EditorInfo.IME_ACTION_SEND ||
                    actionId == EditorInfo.IME_ACTION_SEARCH ||
                    isEnterEvent
                ) {
                    keyHandler.removeCallbacks(editTextBurstRunnable)
                    val clean = text?.toString()?.replace("\n", "")?.replace("\r", "")?.trim() ?: ""
                    clearScannerEditText()
                    if (clean.isNotEmpty()) {
                        emitBarcode(clean)
                    }
                    ensureScannerFocusAndHideKeyboard()
                    true
                } else {
                    false
                }
            }
        }

        contentGroup.addView(edit)
        scannerEditText = edit

        window?.decorView?.viewTreeObserver?.addOnGlobalFocusChangeListener { _, newFocus ->
            if (scannerModeEnabled && newFocus != scannerEditText) {
                keyHandler.post {
                    ensureScannerFocusAndHideKeyboard()
                }
            }
        }

        return edit
    }

    private fun hideSoftKeyboard() {
        try {
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.hideSoftInputFromWindow(window.decorView.windowToken, 0)
            scannerEditText?.windowToken?.let { token ->
                imm?.hideSoftInputFromWindow(token, 0)
            }
        } catch (_: Exception) {}
    }

    private fun ensureScannerFocusAndHideKeyboard() {
        if (!scannerModeEnabled) return
        runOnUiThread {
            try {
                window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
                val edit = scannerEditText ?: setupScannerEditText()
                if (edit != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        edit.showSoftInputOnFocus = false
                    }
                    if (!edit.hasFocus()) {
                        edit.requestFocus()
                    }
                }
                hideSoftKeyboard()
            } catch (_: Exception) {}
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
        methodChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "hideKeyboard" -> {
                    ensureScannerFocusAndHideKeyboard()
                    result.success(true)
                }
                "setScannerMode" -> {
                    val enabled = call.arguments as? Boolean ?: true
                    scannerModeEnabled = enabled
                    if (enabled) {
                        ensureScannerFocusAndHideKeyboard()
                    } else {
                        // Allow FlutterView to take focus and display the soft keyboard for manual dialog
                        runOnUiThread {
                            scannerEditText?.clearFocus()
                            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_UNCHANGED)
                        }
                    }
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }

        keyHandler.post {
            setupScannerEditText()
            if (scannerModeEnabled) {
                ensureScannerFocusAndHideKeyboard()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (scannerModeEnabled) {
            ensureScannerFocusAndHideKeyboard()
        }

        val filter = IntentFilter().apply {
            addAction("com.custom.barcode.action")
            addAction("com.custom.scanner.action")
            addAction("com.custom.action.BARCODE_DATA")
            addAction("custom.barcode.action")
            addAction("com.scanner.broadcast")
            addAction("android.intent.action.DECODE_DATA")
            addAction("com.android.server.scannerservice.broadcast")
            addAction("scan.rcv.message")
            addAction("com.barcode.sendBroadcast")
            addAction("nlscan.action.SCANER_RESULT")
            addAction("action.barcode.reader.value")
            addAction("com.honeywell.decode.intent.action.EDIT_DATA")
            addAction("com.symbol.emdk.datawedge.api.RESULT_ACTION")
            addAction("urovo.rcv.message")
            addAction("com.zebra.datacapture1.action")
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
        keyHandler.removeCallbacks(editTextBurstRunnable)
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        val handled = super.dispatchTouchEvent(ev)
        if (scannerModeEnabled && (ev.action == MotionEvent.ACTION_UP || ev.action == MotionEvent.ACTION_CANCEL)) {
            keyHandler.postDelayed({
                ensureScannerFocusAndHideKeyboard()
            }, 40)
        }
        return handled
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (!scannerModeEnabled) {
            return super.dispatchKeyEvent(event)
        }

        if (event.action == KeyEvent.ACTION_DOWN) {
            val now = System.currentTimeMillis()
            if (now - lastKeyTime > 600) {
                barcodeBuffer.setLength(0)
            }
            lastKeyTime = now

            if (event.keyCode == KeyEvent.KEYCODE_ENTER ||
                event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
                event.keyCode == KeyEvent.KEYCODE_TAB
            ) {
                keyHandler.removeCallbacks(burstRunnable)
                val buffered = barcodeBuffer.toString().trim()
                barcodeBuffer.setLength(0)
                val editVal = scannerEditText?.text?.toString()?.replace("\n", "")?.replace("\r", "")?.trim() ?: ""
                clearScannerEditText()

                val finalCode = if (editVal.isNotEmpty()) editVal else buffered
                if (finalCode.isNotEmpty()) {
                    emitBarcode(finalCode)
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

                keyHandler.removeCallbacks(burstRunnable)
                keyHandler.postDelayed(burstRunnable, 130)
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
