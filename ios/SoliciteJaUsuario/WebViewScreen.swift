import SwiftUI
import WebKit

struct WebViewScreen: View {
    @StateObject private var webViewModel = WebViewModel()
    
    var body: some View {
        ZStack {
            Color(UIColor.systemBackground)
                .ignoresSafeArea()
            
            SwiftUIWebView(viewModel: webViewModel)
                .ignoresSafeArea(.keyboard, edges: .bottom)
            
            if webViewModel.isLoading && !webViewModel.hasLoadedOnce {
                VStack(spacing: 16) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color(red: 0.14, green: 0.38, blue: 0.92)))
                        .scaleEffect(1.4)
                    
                    Text("Carregando Solicite Já Pereiro...")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(UIColor.systemBackground))
            }
            
            if webViewModel.showError {
                VStack(spacing: 16) {
                    Image(systemName: "wifi.slash")
                        .font(.system(size: 48))
                        .foregroundColor(.red)
                    
                    Text("Sem conexão com a internet")
                        .font(.title3)
                        .fontWeight(.bold)
                    
                    Text("Não foi possível conectar ao solicitejapereiro.online. Verifique sua conexão e tente novamente.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                    
                    Button(action: {
                        webViewModel.reload()
                    }) {
                        HStack {
                            Image(systemName: "arrow.clockwise")
                            Text("Tentar Novamente")
                                .fontWeight(.bold)
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Color(red: 0.14, green: 0.38, blue: 0.92))
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(UIColor.systemBackground))
            }
        }
    }
}

class WebViewModel: ObservableObject {
    @Published var isLoading: Bool = true
    @Published var hasLoadedOnce: Bool = false
    @Published var showError: Bool = false
    
    var webView: WKWebView?
    
    func reload() {
        showError = false
        isLoading = true
        if let url = URL(string: "https://solicitejapereiro.online/app") {
            webView?.load(URLRequest(url: url))
        }
    }
}

struct SwiftUIWebView: UIViewRepresentable {
    @ObservedObject var viewModel: WebViewModel
    private let appURL = URL(string: "https://solicitejapereiro.online/app")!
    
    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }
    
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        
        // Refresh Control
        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(context.coordinator, action: #selector(Coordinator.handleRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl
        
        viewModel.webView = webView
        webView.load(URLRequest(url: appURL))
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url == nil {
            webView.load(URLRequest(url: appURL))
        }
    }
    
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var viewModel: WebViewModel
        
        init(viewModel: WebViewModel) {
            self.viewModel = viewModel
        }
        
        @objc func handleRefresh(_ sender: UIRefreshControl) {
            viewModel.webView?.reload()
            sender.endRefreshing()
        }
        
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.viewModel.isLoading = true
            }
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.viewModel.isLoading = false
                self.viewModel.hasLoadedOnce = true
                self.viewModel.showError = false
            }
        }
        
        func webView(_ webView: WKWebView, didFail provisionalNavigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async {
                self.viewModel.isLoading = false
                if (error as NSError).code != NSURLErrorCancelled {
                    self.viewModel.showError = true
                }
            }
        }
        
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            
            if ["http", "https"].contains(url.scheme?.lowercased()) {
                decisionHandler(.allow)
                return
            }
            
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }
}