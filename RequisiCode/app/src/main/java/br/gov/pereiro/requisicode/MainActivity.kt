package br.gov.pereiro.requisicode

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private val scanner = BarcodeScanning.getClient()
    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var detailsText: TextView
    private lateinit var confirmButton: Button
    private lateinit var scanAgainButton: Button
    private var currentQrPayload: String? = null
    private var scannerPaused = false

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                startCamera()
            } else {
                statusText.text = "Permissão da câmera negada. Libere a câmera nas configurações do app."
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = PRIMARY
        buildScreen()
        requestCameraPermissionOrStart()
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraExecutor.shutdown()
        scanner.close()
    }

    private fun buildScreen() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(BACKGROUND)
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(20.dp(), 16.dp(), 20.dp(), 16.dp())
            background = rounded(PRIMARY, 0.dp())
        }
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.requisicode_logo)
            adjustViewBounds = true
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "RequisiCode"
        }
        header.addView(
            logo,
            LinearLayout.LayoutParams(88.dp(), 88.dp()).apply {
                bottomMargin = 8.dp()
            },
        )
        val title = TextView(this).apply {
            text = "RequisiCode"
            textSize = 21f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        val subtitle = TextView(this).apply {
            text = "Leitor de QR Code do Almoxarifado"
            textSize = 14f
            setTextColor(Color.rgb(222, 230, 240))
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 3.dp(), 0, 0)
        }
        header.addView(title, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        header.addView(subtitle, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        root.addView(header, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(18.dp(), 18.dp(), 18.dp(), 18.dp())
        }
        root.addView(content, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        val cameraFrame = LinearLayout(this).apply {
            setPadding(3.dp(), 3.dp(), 3.dp(), 3.dp())
            background = roundedStroke(Color.WHITE, BORDER, 10.dp(), 1.dp())
        }
        previewView = PreviewView(this).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            background = rounded(Color.rgb(15, 23, 42), 8.dp())
        }
        cameraFrame.addView(previewView, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT)
        content.addView(
            cameraFrame,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f).apply {
                bottomMargin = 14.dp()
            },
        )

        statusText = TextView(this).apply {
            text = "Aponte a câmera para o QR Code da requisição."
            textSize = 15f
            setTextColor(MUTED_FOREGROUND)
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(4.dp(), 0, 4.dp(), 12.dp())
        }
        content.addView(statusText, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)

        val detailsCard = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16.dp(), 14.dp(), 16.dp(), 14.dp())
            background = roundedStroke(Color.WHITE, BORDER, 8.dp(), 1.dp())
        }
        val detailsTitle = TextView(this).apply {
            text = "Dados da requisição"
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(FOREGROUND)
        }
        detailsText = TextView(this).apply {
            text = "Nenhum pedido lido."
            textSize = 15f
            setTextColor(FOREGROUND)
            setLineSpacing(2.dp().toFloat(), 1f)
            setPadding(0, 8.dp(), 0, 0)
        }
        detailsCard.addView(detailsTitle, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        detailsCard.addView(detailsText, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        content.addView(detailsCard, LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)

        confirmButton = Button(this).apply {
            text = "Confirmar pronto"
            isAllCaps = false
            textSize = 15f
            isEnabled = false
            setOnClickListener { confirmReady() }
        }
        content.addView(
            confirmButton,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 48.dp()).apply {
                topMargin = 14.dp()
            },
        )

        scanAgainButton = Button(this).apply {
            text = "Ler outro QR Code"
            isAllCaps = false
            textSize = 15f
            setTextColor(PRIMARY)
            background = roundedStroke(Color.WHITE, BORDER, 8.dp(), 1.dp())
            setOnClickListener {
                currentQrPayload = null
                scannerPaused = false
                setConfirmEnabled(false)
                detailsText.text = "Nenhum pedido lido."
                statusText.text = "Aponte a câmera para o QR Code da requisição."
                requestCameraPermissionOrStart()
            }
        }
        content.addView(
            scanAgainButton,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 48.dp()).apply {
                topMargin = 8.dp()
            },
        )

        setConfirmEnabled(false)
        setContentView(root)
    }

    private fun requestCameraPermissionOrStart() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            statusText.text = "Autorize a câmera para ler o QR Code da requisição."
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)

        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }
            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(cameraExecutor) { imageProxy -> analyzeImage(imageProxy) }
                }

            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                this,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analyzer,
            )
        }, ContextCompat.getMainExecutor(this))
    }

    @OptIn(ExperimentalGetImage::class)
    private fun analyzeImage(imageProxy: ImageProxy) {
        if (scannerPaused) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        scanner.process(inputImage)
            .addOnSuccessListener { barcodes ->
                val value = barcodes
                    .firstOrNull { it.format == Barcode.FORMAT_QR_CODE && !it.rawValue.isNullOrBlank() }
                    ?.rawValue

                if (!value.isNullOrBlank()) {
                    handleQrValue(value)
                }
            }
            .addOnCompleteListener {
                imageProxy.close()
            }
    }

    private fun handleQrValue(value: String) {
        if (scannerPaused) return

        runOnUiThread {
            try {
                val qr = JSONObject(value)
                if (qr.optString("kind") != "almoxarifado_requisicao" || qr.optInt("version") != 1) {
                    statusText.text = "QR Code inválido para este aplicativo."
                    return@runOnUiThread
                }

                scannerPaused = true
                currentQrPayload = value
                setConfirmEnabled(true)
                statusText.text = "Pedido lido. Confira as informações."
                detailsText.text = buildString {
                    appendLine("Pedido: ${qr.optString("requestCode", "-")}")
                    appendLine("Tipo: ${qr.optString("materialType", "-")}")
                    appendLine("Programa: ${qr.optString("program", "-")}")
                    appendLine("Usuário: ${qr.optString("requester", "-")}")
                    appendLine("CPF: ${qr.optString("requesterCpf", "-")}")
                    append("Data: ${qr.optString("requestDate", "-")}")
                }
            } catch (_: Exception) {
                statusText.text = "QR Code inválido."
            }
        }
    }

    private fun confirmReady() {
        val payload = currentQrPayload ?: return

        setConfirmEnabled(false)
        statusText.text = "Confirmando pedido e enviando WhatsApp..."

        Thread {
            try {
                val connection = (URL(BuildConfig.CONFIRM_READY_ENDPOINT).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 20000
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                }

                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(JSONObject().put("qrPayload", payload).toString())
                }

                val responseText = if (connection.responseCode in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                }

                val responseJson = JSONObject(responseText)
                if (!responseJson.optBoolean("ok")) {
                    throw IllegalStateException(responseJson.optString("error", "Erro ao confirmar pedido."))
                }

                val skippedReason = responseJson.optString("notificationSkippedReason")
                runOnUiThread {
                    statusText.text = if (skippedReason.isBlank()) {
                        "Pedido confirmado. Usuário notificado no WhatsApp."
                    } else {
                        "Pedido confirmado. $skippedReason"
                    }
                    setConfirmEnabled(false)
                }
            } catch (error: Exception) {
                runOnUiThread {
                    statusText.text = error.message ?: "Erro ao confirmar pedido."
                    setConfirmEnabled(true)
                }
            }
        }.start()
    }

    private fun setConfirmEnabled(enabled: Boolean) {
        confirmButton.isEnabled = enabled
        confirmButton.setTextColor(if (enabled) Color.WHITE else Color.rgb(100, 116, 139))
        confirmButton.background = rounded(
            if (enabled) PRIMARY else Color.rgb(226, 232, 240),
            8.dp(),
        )
    }

    private fun rounded(color: Int, radius: Int): GradientDrawable =
        GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radius.toFloat()
            setColor(color)
        }

    private fun roundedStroke(color: Int, strokeColor: Int, radius: Int, strokeWidth: Int): GradientDrawable =
        rounded(color, radius).apply {
            setStroke(strokeWidth, strokeColor)
        }

    private fun Int.dp(): Int = (this * resources.displayMetrics.density).toInt()

    companion object {
        private val PRIMARY = Color.rgb(47, 67, 98)
        private val BACKGROUND = Color.rgb(248, 250, 252)
        private val FOREGROUND = Color.rgb(32, 45, 67)
        private val MUTED_FOREGROUND = Color.rgb(86, 101, 123)
        private val BORDER = Color.rgb(221, 228, 238)
    }
}
