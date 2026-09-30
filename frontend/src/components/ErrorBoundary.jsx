/**
 * Contiene errores lanzados durante el render para evitar que toda la app quede en blanco.
 *
 * Directriz C.18 [MUST]: debe existir al menos una estrategia de contencion de errores de
 * render. Directriz 0.2: la contencion de errores de render requiere tecnicamente un
 * componente de clase (React solo expone `getDerivedStateFromError`/`componentDidCatch` en
 * clases); esta es la excepcion explicita y documentada a "solo componentes de funcion" (C.5).
 * No sustituye el manejo de errores de negocio/red, que vive en los servicios (C.18).
 *
 * @author Equipo de ingenieria
 * @since 2026-09-29
 */
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // El detalle tecnico va a monitoreo/consola, nunca a la pantalla del usuario (C.18).
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
          <div className="max-w-md w-full text-center bg-white border border-neutral-200 rounded-xl p-8 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-2xl">!</div>
            <h1 className="text-lg font-bold text-neutral-900">Ocurrió un error inesperado</h1>
            <p className="text-sm text-neutral-500 mt-2">
              La pantalla no se pudo mostrar correctamente. Puedes recargar para continuar.
            </p>
            <button
              onClick={this.handleReload}
              className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
