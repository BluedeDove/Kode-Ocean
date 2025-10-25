#!/usr/bin/env python3
"""
Ocean ML Workflow Example
Demonstrates the complete workflow: data loading -> model training -> visualization
"""

import sys
import json
import time
from pathlib import Path
import requests

# Example: Simple FNO-like model training simulation
# In real use, you would use actual torch, h5py, etc.

DASHBOARD_URL = "http://localhost:3737"


def update_dashboard_status(status, current_epoch=0, total_epochs=0):
    """Update training status on dashboard"""
    try:
        requests.post(
            f"{DASHBOARD_URL}/api/training/status",
            json={
                "status": status,
                "currentEpoch": current_epoch,
                "totalEpochs": total_epochs
            },
            timeout=5
        )
    except:
        pass


def add_training_metric(epoch, loss, metrics=None):
    """Add training metric to dashboard"""
    try:
        requests.post(
            f"{DASHBOARD_URL}/api/training/metric",
            json={
                "epoch": epoch,
                "loss": loss,
                "metrics": metrics or {}
            },
            timeout=5
        )
    except:
        pass


def update_model_info(model_name, params):
    """Update model information on dashboard"""
    try:
        requests.post(
            f"{DASHBOARD_URL}/api/model/architecture",
            json={"architecture": model_name},
            timeout=5
        )
        requests.post(
            f"{DASHBOARD_URL}/api/model/variables",
            json=params,
            timeout=5
        )
    except:
        pass


def add_log(message, level="info"):
    """Add log to dashboard"""
    try:
        requests.post(
            f"{DASHBOARD_URL}/api/log",
            json={"level": level, "message": message},
            timeout=5
        )
    except:
        pass


def simulate_training(epochs=100, target_loss=0.01):
    """Simulate model training with decreasing loss"""
    add_log("Starting training simulation", "info")
    update_dashboard_status("running", 0, epochs)

    # Simulate decreasing loss
    initial_loss = 1.0
    for epoch in range(1, epochs + 1):
        # Exponential decay simulation
        loss = initial_loss * (0.95 ** epoch) + 0.005

        # Add metrics
        metrics = {
            "mae": loss * 1.2,
            "rmse": loss * 1.5,
            "r2": min(0.99, 1 - loss)
        }

        add_training_metric(epoch, loss, metrics)
        add_log(f"Epoch {epoch}/{epochs}: Loss = {loss:.6f}", "info")

        # Check if target reached
        if loss < target_loss:
            add_log(f"Target loss {target_loss} reached at epoch {epoch}!", "info")
            update_dashboard_status("completed", epoch, epochs)
            return {"success": True, "final_loss": loss, "epochs_trained": epoch}

        update_dashboard_status("running", epoch, epochs)
        time.sleep(0.1)  # Simulate training time

    update_dashboard_status("completed", epochs, epochs)
    final_loss = initial_loss * (0.95 ** epochs) + 0.005

    return {
        "success": True,
        "final_loss": final_loss,
        "epochs_trained": epochs,
        "target_reached": final_loss < target_loss
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Ocean ML Training Example")
    parser.add_argument("--epochs", type=int, default=50, help="Number of epochs")
    parser.add_argument("--target-loss", type=float, default=0.01, help="Target loss")
    parser.add_argument("--model", default="FNO", help="Model name")

    args = parser.parse_args()

    # Update model info
    update_model_info(args.model, {
        "layers": 4,
        "modes": 12,
        "width": 64,
        "learning_rate": 0.001
    })

    add_log(f"Training {args.model} for {args.epochs} epochs", "info")

    # Run training
    result = simulate_training(args.epochs, args.target_loss)

    # Output result
    print(json.dumps(result, indent=2))

    return 0 if result["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
