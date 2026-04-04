from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import get_db

orders_bp = Blueprint("orders", __name__, url_prefix="/orders")

# ── Priority scoring (mirrors frontend heap.js) ───────────────────────
TYPE_SCORE = {"express": 50, "standard": 25, "economy": 10}
ZONE_SCORE = {"A": 15, "B": 10, "C": 5}
TIER_SCORE = {"premium": 20, "regular": 10, "basic": 5}

def calc_priority(order_type, zone, tier, age_minutes=0):
    age_factor = min(age_minutes * 0.4, 30)
    return (
        TYPE_SCORE.get(order_type, 0) +
        ZONE_SCORE.get(zone, 0) +
        TIER_SCORE.get(tier, 0) +
        age_factor
    )

def row_to_dict(row):
    return dict(row)


# ── GET /orders ───────────────────────────────────────────────────────
@orders_bp.route("", methods=["GET"])
@jwt_required()
def get_orders():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM orders WHERE status = 'queued' ORDER BY priority DESC"
    ).fetchall()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows]), 200


# ── POST /orders ──────────────────────────────────────────────────────
@orders_bp.route("", methods=["POST"])
@jwt_required()
def add_order():
    data = request.get_json()

    required = ["id", "customer", "product", "qty", "amount", "type", "zone", "tier"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Missing field: {field}"}), 400

    order_type = data["type"]
    zone       = data["zone"]
    tier       = data["tier"]

    if order_type not in TYPE_SCORE:
        return jsonify({"error": "Invalid type"}), 400
    if zone not in ZONE_SCORE:
        return jsonify({"error": "Invalid zone"}), 400
    if tier not in TIER_SCORE:
        return jsonify({"error": "Invalid tier"}), 400

    priority = calc_priority(order_type, zone, tier, age_minutes=0)

    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO orders (id, customer, product, qty, amount, type, zone, tier, age_minutes, priority, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'queued')
        """, (
            data["id"], data["customer"], data["product"],
            int(data["qty"]), float(data["amount"]),
            order_type, zone, tier, priority
        ))
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 409
    conn.close()

    return jsonify({"message": "Order added", "priority": priority}), 201


# ── POST /orders/dispatch ─────────────────────────────────────────────
@orders_bp.route("/dispatch", methods=["POST"])
@jwt_required()
def dispatch_order():
    conn = get_db()

    # Get highest priority queued order
    top = conn.execute(
        "SELECT * FROM orders WHERE status = 'queued' ORDER BY priority DESC LIMIT 1"
    ).fetchone()

    if not top:
        conn.close()
        return jsonify({"error": "No orders in queue"}), 404

    order = row_to_dict(top)

    # Move to delivered_log
    conn.execute("""
        INSERT INTO delivered_log (id, customer, product, qty, amount, type, zone, tier, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        order["id"], order["customer"], order["product"],
        order["qty"], order["amount"], order["type"],
        order["zone"], order["tier"], order["priority"]
    ))

    # Mark as delivered in orders
    conn.execute("UPDATE orders SET status = 'delivered' WHERE id = ?", (order["id"],))
    conn.commit()
    conn.close()

    return jsonify({"dispatched": order}), 200


# ── GET /orders/delivered ─────────────────────────────────────────────
@orders_bp.route("/delivered", methods=["GET"])
@jwt_required()
def get_delivered():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM delivered_log ORDER BY delivered_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([row_to_dict(r) for r in rows]), 200


# ── PATCH /orders/age ─────────────────────────────────────────────────
# Called periodically by the frontend aging engine to bump priorities
@orders_bp.route("/age", methods=["PATCH"])
@jwt_required()
def age_orders():
    INCREMENT = 0.17   # matches frontend constant
    conn = get_db()
    rows = conn.execute(
        "SELECT id, type, zone, tier, age_minutes FROM orders WHERE status = 'queued'"
    ).fetchall()

    for row in rows:
        new_age = row["age_minutes"] + INCREMENT
        new_priority = calc_priority(row["type"], row["zone"], row["tier"], new_age)
        conn.execute(
            "UPDATE orders SET age_minutes = ?, priority = ? WHERE id = ?",
            (new_age, new_priority, row["id"])
        )

    conn.commit()
    conn.close()
    return jsonify({"updated": len(rows)}), 200


# ── DELETE /orders/<id> ───────────────────────────────────────────────
@orders_bp.route("/<order_id>", methods=["DELETE"])
@jwt_required()
def delete_order(order_id):
    conn = get_db()
    conn.execute("DELETE FROM orders WHERE id = ? AND status = 'queued'", (order_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Deleted"}), 200
