import SwiftUI

@main
struct SoliciteJaUsuarioApp: App {
    var body: some Scene {
        WindowGroup {
            WebViewScreen()
                .ignoresSafeArea(.keyboard, edges: .bottom)
        }
    }
}