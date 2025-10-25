#!/usr/bin/env python3
"""
Ocean ML Dashboard Integration Template

This is the CORRECT way to integrate Ocean ML Dashboard into training scripts.
Copy this DashboardClient class into your training script for dashboard support.

=============================================================================
IMPORTANT: Dashboard API Endpoints (from dashboardServer.ts)
=============================================================================

GET  /api/state              - Get current dashboard state
GET  /api/health             - Health check
POST /api/model/architecture - Update model architecture name
                               Body: {"architecture": "Model Name"}
POST /api/model/variables    - Update model parameters/variables
                               Body: {param1: value1, param2: value2, ...}
POST /api/training/status    - Update training status (start/epoch/complete/fail)
                               Body: {"status": "running|completed|failed",
                                      "currentEpoch": 10,
                                      "totalEpochs": 100}
POST /api/training/metric    - Add training metric for one epoch
                               Body: {"epoch": 1, "loss": 0.5,
                                      "metrics": {"mae": 0.3, "rmse": 0.4}}
POST /api/visualization      - Add visualization
                               Body: {"title": "Plot Title",
                                      "imagePath": "/outputs/plot.png",
                                      "type": "training_curve|error_map|..."}
POST /api/data/info          - Update data information
                               Body: {"format": "hdf5", "shape": [100, 64, 64], ...}
POST /api/log                - Add log entry
                               Body: {"level": "info|warning|error",
                                      "message": "Log message"}
POST /api/clear              - Clear all dashboard data
                               Body: {} (empty)

CRITICAL: Parameter name casing matters!
  - Use "imagePath" NOT "image_path"
  - Use "currentEpoch" NOT "current_epoch"
  - Use "totalEpochs" NOT "total_epochs"
=============================================================================
"""

import requests
import torch
import torch.nn as nn


class DashboardClient:
    """
    Simplified Dashboard Client for Ocean ML Training

    Usage:
        client = DashboardClient("http://localhost:3737")

        # 1. Clear old data
        client.clear_all()

        # 2. Update model info
        client.update_model_info(
            architecture="FNO-2D",
            params={"modes": 12, "width": 64},
            layer_info=[{"name": "conv1", "type": "SpectralConv2d", "params": 1024}, ...]
        )

        # 3. Start training
        client.start_training(total_epochs=100)

        # 4. Training loop
        for epoch in range(100):
            # ... train one epoch ...
            client.add_metric(epoch+1, loss, {"mae": mae, "rmse": rmse})
            client.update_epoch(epoch+1, 100)
            client.log_info(f"Epoch {epoch+1} completed")

        # 5. Complete
        client.complete_training(100, 100)
    """

    def __init__(self, url="http://localhost:3737"):
        self.url = url

    # ==================== Utility ====================

    def ping(self):
        """Check if dashboard is reachable"""
        try:
            response = requests.get(f"{self.url}/api/health", timeout=2)
            return response.status_code == 200
        except:
            return False

    def clear_all(self):
        """
        Clear all dashboard data

        IMPORTANT: Call this at the start of each new training run!
        Otherwise old metrics/logs/visualizations will mix with new data.
        """
        try:
            response = requests.post(f"{self.url}/api/clear", timeout=2)
            return response.status_code == 200
        except:
            return False

    # ==================== Model Information ====================

    def update_model_info(self, architecture, params, layer_info=None):
        """
        Update complete model information

        Args:
            architecture (str): Model architecture name (e.g., "FNO-2D", "ResNet-50")
            params (dict): Model hyperparameters
                e.g., {"modes": 12, "width": 64, "learning_rate": 0.001}
            layer_info (list, optional): List of layer configurations
                e.g., [{"name": "conv1", "type": "SpectralConv2d", "params": 1024,
                        "input_shape": [64, 64], "output_shape": [64, 64]}, ...]

        CRITICAL: This must call TWO endpoints:
        1. /api/model/architecture - for architecture name
        2. /api/model/variables - for parameters and layer details
        """
        try:
            # 1. Update architecture name
            requests.post(
                f"{self.url}/api/model/architecture",
                json={"architecture": architecture},
                timeout=2
            )

            # 2. Update model parameters (including layer_info if provided)
            variables = params.copy() if params else {}
            if layer_info:
                variables['layers_detail'] = layer_info
                # Calculate total parameters from layer_info
                variables['total_parameters'] = sum(
                    layer.get('params', 0) for layer in layer_info
                )

            requests.post(
                f"{self.url}/api/model/variables",
                json=variables,
                timeout=2
            )
            return True
        except Exception as e:
            print(f"Warning: Failed to update model info: {e}")
            return False

    # ==================== Training Status ====================

    def start_training(self, total_epochs):
        """
        Mark training as started

        Args:
            total_epochs (int): Total number of epochs to train

        Endpoint: POST /api/training/status
        Body: {"status": "running", "currentEpoch": 0, "totalEpochs": total_epochs}
        """
        try:
            requests.post(
                f"{self.url}/api/training/status",
                json={
                    "status": "running",
                    "currentEpoch": 0,
                    "totalEpochs": total_epochs
                },
                timeout=2
            )
        except:
            pass

    def update_epoch(self, current_epoch, total_epochs):
        """
        Update current epoch progress

        Args:
            current_epoch (int): Current epoch number (1-indexed)
            total_epochs (int): Total number of epochs

        Endpoint: POST /api/training/status
        Body: {"status": "running", "currentEpoch": current_epoch, "totalEpochs": total_epochs}
        """
        try:
            requests.post(
                f"{self.url}/api/training/status",
                json={
                    "status": "running",
                    "currentEpoch": current_epoch,
                    "totalEpochs": total_epochs
                },
                timeout=2
            )
        except:
            pass

    def complete_training(self, current_epoch, total_epochs):
        """
        Mark training as completed

        Args:
            current_epoch (int): Final epoch number
            total_epochs (int): Total number of epochs

        Endpoint: POST /api/training/status
        Body: {"status": "completed", "currentEpoch": current_epoch, "totalEpochs": total_epochs}
        """
        try:
            requests.post(
                f"{self.url}/api/training/status",
                json={
                    "status": "completed",
                    "currentEpoch": current_epoch,
                    "totalEpochs": total_epochs
                },
                timeout=2
            )
        except:
            pass

    def fail_training(self, current_epoch, total_epochs):
        """
        Mark training as failed

        Args:
            current_epoch (int): Epoch where training failed
            total_epochs (int): Total number of epochs planned

        Endpoint: POST /api/training/status
        Body: {"status": "failed", "currentEpoch": current_epoch, "totalEpochs": total_epochs}
        """
        try:
            requests.post(
                f"{self.url}/api/training/status",
                json={
                    "status": "failed",
                    "currentEpoch": current_epoch,
                    "totalEpochs": total_epochs
                },
                timeout=2
            )
        except:
            pass

    # ==================== Training Metrics ====================

    def add_metric(self, epoch, loss, metrics=None):
        """
        Add training metric for one epoch

        Args:
            epoch (int): Epoch number (1-indexed)
            loss (float): Loss value for this epoch
            metrics (dict, optional): Additional metrics
                e.g., {"mae": 0.1, "rmse": 0.2, "r2": 0.95}

        Endpoint: POST /api/training/metric
        Body: {"epoch": epoch, "loss": loss, "metrics": metrics or {}}

        IMPORTANT: Call this EVERY epoch to update training curves!
        """
        try:
            requests.post(
                f"{self.url}/api/training/metric",
                json={
                    "epoch": epoch,
                    "loss": loss,
                    "metrics": metrics or {}
                },
                timeout=2
            )
        except:
            pass

    # ==================== Visualizations ====================

    def add_visualization(self, title, image_path, viz_type="plot"):
        """
        Add visualization to dashboard

        Args:
            title (str): Visualization title
            image_path (str): Path to image file (relative to dashboard perspective)
                e.g., "/outputs/training_curve.png"
            viz_type (str): Type of visualization
                e.g., "training_curve", "error_map", "comparison", "plot"

        Endpoint: POST /api/visualization
        Body: {"title": title, "imagePath": image_path, "type": viz_type}

        CRITICAL: Parameter names matter!
          - Use "imagePath" (camelCase) NOT "image_path" (snake_case)
          - Use "type" NOT "viz_type"

        Example:
            plt.plot(epochs, losses)
            plt.savefig("outputs/curve.png")
            client.add_visualization("Training Curve", "/outputs/curve.png", "training_curve")
        """
        try:
            requests.post(
                f"{self.url}/api/visualization",
                json={
                    "title": title,
                    "imagePath": image_path,  # Must be 'imagePath', not 'image_path'!
                    "type": viz_type          # Must be 'type', not 'viz_type'!
                },
                timeout=2
            )
        except:
            pass

    # ==================== Logging ====================

    def log_info(self, message):
        """
        Add info log

        Args:
            message (str): Log message

        Endpoint: POST /api/log
        Body: {"level": "info", "message": message}
        """
        try:
            requests.post(
                f"{self.url}/api/log",
                json={"level": "info", "message": message},
                timeout=2
            )
        except:
            pass

    def log_warning(self, message):
        """
        Add warning log

        Args:
            message (str): Warning message

        Endpoint: POST /api/log
        Body: {"level": "warning", "message": message}
        """
        try:
            requests.post(
                f"{self.url}/api/log",
                json={"level": "warning", "message": message},
                timeout=2
            )
        except:
            pass

    def log_error(self, message):
        """
        Add error log

        Args:
            message (str): Error message

        Endpoint: POST /api/log
        Body: {"level": "error", "message": message}
        """
        try:
            requests.post(
                f"{self.url}/api/log",
                json={"level": "error", "message": message},
                timeout=2
            )
        except:
            pass


# =============================================================================
# COMPLETE TRAINING SCRIPT TEMPLATE
# =============================================================================

def example_training_with_dashboard():
    """
    Complete example of how to integrate Dashboard into a training script
    """

    # 0. Setup dashboard client
    client = DashboardClient("http://localhost:3737")

    # Check connection
    if not client.ping():
        print("⚠️  Warning: Dashboard not reachable at http://localhost:3737")
        print("   Start dashboard with: kode ocean_dashboard tool")

    # 1. CRITICAL: Clear old data before starting new training
    client.clear_all()
    client.log_info("=" * 60)
    client.log_info("NEW TRAINING SESSION - Dashboard cleared")
    client.log_info("=" * 60)

    # 2. Setup GPU device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    client.log_info(f"Using device: {device}")

    if device.type == 'cuda':
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
        client.log_info(f"GPU: {gpu_name}, Memory: {gpu_memory:.2f}GB")
    else:
        client.log_warning("GPU not available - training will be slow!")

    # 3. Create model
    # model = YourModel().to(device)
    # For this example, we'll simulate with dummy values
    total_params = 2_500_000

    # 4. Update model information with detailed layer info
    layer_info = [
        {
            "name": "conv1",
            "type": "SpectralConv2d",
            "params": 49152,
            "input_shape": [64, 64],
            "output_shape": [64, 64]
        },
        {
            "name": "conv2",
            "type": "SpectralConv2d",
            "params": 49152,
            "input_shape": [64, 64],
            "output_shape": [64, 64]
        },
        {
            "name": "fc",
            "type": "Linear",
            "params": 4096,
            "input_shape": [64],
            "output_shape": [1]
        }
    ]

    client.update_model_info(
        architecture="FNO-2D Example",
        params={
            "modes": 12,
            "width": 64,
            "learning_rate": 0.001,
            "batch_size": 32,
            "optimizer": "Adam",
            "device": str(device),
            "total_parameters": total_params
        },
        layer_info=layer_info
    )

    client.log_info(f"Model created: {total_params:,} parameters")

    # 5. Start training
    num_epochs = 50
    client.start_training(num_epochs)
    client.log_info(f"Starting training for {num_epochs} epochs")

    # 6. Training loop
    for epoch in range(1, num_epochs + 1):
        # ... actual training code here ...

        # Simulate training (replace with real training)
        train_loss = 1.0 / epoch  # Decreasing loss
        val_loss = 1.2 / epoch
        mae = 0.8 / epoch
        rmse = 1.5 / epoch

        # Update metrics (EVERY EPOCH!)
        client.add_metric(
            epoch=epoch,
            loss=train_loss,
            metrics={
                "train_loss": train_loss,
                "val_loss": val_loss,
                "mae": mae,
                "rmse": rmse
            }
        )

        # Update epoch progress
        client.update_epoch(epoch, num_epochs)

        # Log progress
        if epoch % 10 == 0:
            client.log_info(f"Epoch {epoch}/{num_epochs} - Loss: {train_loss:.4f}")

        # Monitor GPU memory every 10 epochs
        if device.type == 'cuda' and epoch % 10 == 0:
            allocated = torch.cuda.memory_allocated(0) / 1024**3
            reserved = torch.cuda.memory_reserved(0) / 1024**3
            client.log_info(f"GPU Memory: {allocated:.2f}GB allocated, {reserved:.2f}GB reserved")

        # Generate visualization every 20 epochs
        if epoch % 20 == 0:
            # ... create visualization ...
            # plt.plot(...)
            # plt.savefig("outputs/curve.png")
            client.add_visualization(
                title=f"Training Curve (Epoch {epoch})",
                image_path="/outputs/training_curve.png",
                viz_type="training_curve"
            )

    # 7. Complete training
    client.complete_training(num_epochs, num_epochs)
    client.log_info("=" * 60)
    client.log_info("Training completed successfully!")
    client.log_info("=" * 60)

    # 8. Clear GPU memory
    if device.type == 'cuda':
        torch.cuda.empty_cache()
        client.log_info("GPU memory cleared")


if __name__ == "__main__":
    print("=" * 70)
    print("Ocean ML Dashboard Integration Template")
    print("=" * 70)
    print()
    print("This file demonstrates the CORRECT way to integrate Dashboard.")
    print()
    print("Key points:")
    print("  1. Use correct API endpoints (see docstring at top)")
    print("  2. Call clear_all() before each new training run")
    print("  3. Use camelCase for parameter names (imagePath, currentEpoch, etc.)")
    print("  4. Update model info with detailed layer_info")
    print("  5. Call add_metric() EVERY epoch")
    print("  6. Monitor GPU memory")
    print()
    print("Copy the DashboardClient class into your training script!")
    print("=" * 70)

    # Uncomment to run example:
    # example_training_with_dashboard()
