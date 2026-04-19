import os
from flask import Flask, request, jsonify, send_file
from fpdf import FPDF
import io
import stripe

# Importamos todas las funciones de tu archivo procedures.py
import db
from procedures import (
    crear_usuario, login_user, logout, actualizar_perfil, obtener_usuario,
    gestionar_usuarios, crear_evento, editar_evento,
    eliminar_evento, obtener_detalles_evento, obtener_eventos_disponibles,
    comprar_boleto, obtener_ordenes_usuario,
    generar_reporte_ventas, enviar_notificacion, supervisar_eventos,
    administrar_boletos, consultar_ventas, validar_qr, generar_reporte_pagos, exportar_pdf,
    generar_reporte_asistencia, actualizar_estado,
    generar_boletos, marcar_usado, generar_reportes
)

app = Flask(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def handle_options(path):
    return ("", 204)


# --- RUTAS DE USUARIOS ---

@app.route("/api/crear-usuario", methods=["POST"])
def api_crear_usuario():
    data = request.json
    
    # Extraemos los parámetros del JSON
    nombre = data.get("nombre")
    email = data.get("email")
    password = data.get("password")
    tipo = data.get("tipo", "cliente")

    result = crear_usuario(nombre, email, password, tipo)

    if result["success"]:
        return jsonify(result), 201
    else:
        return jsonify(result), 500


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json
    
    result = login_user(data.get("email"), data.get("password"))

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 401


@app.route("/api/logout", methods=["POST"])
def api_logout():
    data = request.json
    
    result = logout(data.get("user_id"))

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 400
@app.route("/api/actualizar-perfil", methods=["POST"])
def api_actualizar_perfil():
    data = request.json
    
    result = actualizar_perfil(
        data.get("user_id"),
        data.get("nombre"),
        data.get("email"),
        data.get("password")
    )

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route("/api/usuarios", methods=["GET"])
def api_gestionar_usuarios():
    # Como es un GET para listar, no lleva cuerpo JSON
    result = gestionar_usuarios()

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 500

@app.route("/api/mi-perfil/<int:user_id>", methods=["GET"])
def api_obtener_perfil(user_id):
    result = obtener_usuario(user_id)
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 404


# --- RUTAS DE EVENTOS ---

@app.route("/api/crear-evento", methods=["POST"])
def api_crear_evento():
    data = request.json
    
    result = crear_evento(
        data.get("titulo"),
        data.get("fecha"),
        data.get("ubicacion"),
        data.get("capacidad"),
        data.get("descripcion"),
        data.get("categoria", "") or "",
        data.get("org_id")
    )

    if result["success"]:
        return jsonify(result), 201
    else:
        return jsonify(result), 400
@app.route("/api/editar-evento", methods=["POST"])
def api_editar_evento():
    data = request.json
    
    result = editar_evento(
        data.get("evento_id"),
        data.get("titulo"),
        data.get("fecha"),
        data.get("ubicacion"),
        data.get("capacidad"),
        data.get("descripcion"),
        data.get("categoria", "") or "",
    )

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route("/api/eliminar-evento", methods=["POST"])
def api_eliminar_evento():
    data = request.json
    
    result = eliminar_evento(data.get("evento_id"))

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route("/api/evento/<int:evento_id>", methods=["GET"])
def api_obtener_detalles_evento(evento_id):
    # El ID del evento viene directamente en la URL /api/evento/5
    result = obtener_detalles_evento(evento_id)

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 404


# --- RUTAS DE REPORTES Y NOTIFICACIONES ---

@app.route("/api/enviar-notificacion", methods=["POST"])
def api_enviar_notificacion():
    data = request.json
    
    result = enviar_notificacion(
        data.get("usuario_id"),
        data.get("mensaje")
    )

    if result["success"]:
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route("/api/supervisar-eventos", methods=["POST"])
def api_supervisar_eventos():
    result = supervisar_eventos()
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/eventos-disponibles", methods=["GET"])
def api_eventos_disponibles():
    result = obtener_eventos_disponibles()
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 500

@app.route("/api/comprar-boleto", methods=["POST"])
def api_comprar_boleto():
    data = request.json
    result = comprar_boleto(
        data.get("usuario_id"),
        data.get("evento_id"),
        data.get("cantidad", 1),
        data.get("metodo", "Stripe")
    )
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/create-payment-intent", methods=["POST"])
def api_create_payment_intent():
    data = request.json or {}
    evento_id = data.get("evento_id")
    cantidad = int(data.get("cantidad", 1))
    if not evento_id:
        return jsonify({"success": False, "error": "Evento no especificado."}), 400

    connection = db.get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT precio FROM Boletos WHERE evento_id = %s AND estado = 'Disponible' LIMIT %s",
            (evento_id, cantidad)
        )
        boletos = cursor.fetchall()
        if not boletos or len(boletos) < cantidad:
            return jsonify({"success": False, "error": "No hay suficientes boletos disponibles."}), 400

        total = sum(float(boleto["precio"] or 0) for boleto in boletos)
        amount = int(round(total * 100))

        if amount <= 0:
            return jsonify({"success": False, "error": "El monto del pago no es válido."}), 400

        if not stripe.api_key:
            return jsonify({"success": False, "error": "Falta la clave secreta de Stripe en el servidor."}), 500

        intent = stripe.PaymentIntent.create(
            amount=amount,
            currency="mxn",
            payment_method_types=["card"],
            metadata={"evento_id": str(evento_id), "cantidad": str(cantidad)}
        )

        return jsonify({"success": True, "client_secret": intent.client_secret, "amount": amount, "currency": "mxn"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400
    finally:
        cursor.close()
        connection.close()

@app.route("/api/mis-ordenes", methods=["POST"])
def api_mis_ordenes():
    data = request.json
    result = obtener_ordenes_usuario(data.get("usuario_id"))
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/administrar-boletos", methods=["POST"])
def api_administrar_boletos():
    data = request.json
    evento_id = data.get("evento_id")
    
    result = administrar_boletos(evento_id)
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/consultar-ventas", methods=["POST"])
def api_consultar_ventas():
    data = request.json
    organizador_id = data.get("organizador_id")
    
    result = consultar_ventas(organizador_id)
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/validar-qr", methods=["POST"])
def api_validar_qr():
    data = request.json
    codigo_qr = data.get("codigo_qr")
    
    result = validar_qr(codigo_qr)
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/actualizar-estado", methods=["POST"])
def api_actualizar_estado():
    data = request.json
    evento_id = data.get("evento_id")
    nuevo_estado = data.get("nuevo_estado")
    
    result = actualizar_estado(evento_id, nuevo_estado)
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400

@app.route("/api/marcar-usado", methods=["POST"])
def api_marcar_usado():
    data = request.json
    boleto_id = data.get("boleto_id")
    
    result = marcar_usado(boleto_id)
    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 400



@app.route("/api/generar-boletos", methods=["POST"])
def api_generar_boletos():
    data = request.get_json()
    
    if not data:
        return jsonify({"success": False, "error": "No se recibieron datos"}), 400
        
    evento_id = data.get("evento_id")
    precio = data.get("precio")
    
    resultado = generar_boletos(evento_id, precio)
    return jsonify(resultado)
if __name__ == "__main__":
    app.run(debug=True)



@app.route("/api/reportes/imprimir", methods=["POST"])
def api_imprimir_reportes():
    data = request.json
    tipo = data.get("tipo")

    try:
        if tipo == "ventas":
            result = generar_reporte_ventas(1)  # puedes ajustar el evento
        elif tipo == "asistencia":
            result = generar_reporte_asistencia(1)
        elif tipo == "pagos":
            result = generar_reporte_pagos()
        elif tipo == "all":
            ventas = generar_reporte_ventas(1)
            asistencia = generar_reporte_asistencia(1)
            pagos = generar_reporte_pagos()

            result = {
                "ventas": ventas.get("data", []),
                "asistencia": asistencia.get("data", []),
                "pagos": pagos.get("data", [])
            }
        else:
            return jsonify({"success": False, "error": "Tipo de reporte no válido"}), 400

        # Generar PDF
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=10)

        pdf.cell(200, 10, txt=f"Reporte: {tipo.upper()}", ln=True)

        if tipo == "all":
            for key, values in result.items():
                pdf.cell(200, 10, txt=f"--- {key.upper()} ---", ln=True)
                for row in values:
                    pdf.cell(200, 8, txt=str(row), ln=True)
        else:
            for row in result.get("data", []):
                pdf.cell(200, 8, txt=str(row), ln=True)

        output = io.BytesIO()
        pdf.output(output)
        output.seek(0)

        return send_file(output, download_name="reporte.pdf", as_attachment=False)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500