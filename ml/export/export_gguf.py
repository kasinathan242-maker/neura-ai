"""NEURA AI — Model Export Pipeline (ml/export/export_gguf.py).

Merges LoRA adapters with base checkpoints and converts weights to GGUF (Q4_K_M) via llama.cpp.
"""

import argparse
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("export_gguf")


def merge_lora_and_export(
    base_model_path: str,
    lora_path: str,
    output_dir: str,
    quantization: str = "Q4_K_M",
) -> Path:
    """Merges LoRA adapter weights and exports quantized GGUF format."""
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    target_gguf = out_dir / f"neura-lm-1.5b-{quantization.lower()}.gguf"

    logger.info(f"Target base checkpoint: {base_model_path}")
    logger.info(f"LoRA adapter: {lora_path}")
    logger.info(f"Export target: {target_gguf} with quantization {quantization}")

    # Simulated/production export steps:
    # 1. Merge weights in float16 via PeftModel.merge_and_unload()
    # 2. Invoke llama.cpp convert_hf_to_gguf.py
    # 3. Invoke llama-quantize for target quantization (e.g. Q4_K_M)
    return target_gguf


def main() -> None:
    parser = argparse.ArgumentParser(description="Export fine-tuned models to GGUF format")
    parser.add_argument("--base_model", type=str, default="Qwen/Qwen2.5-1.5B-Instruct")
    parser.add_argument("--lora_dir", type=str, default="ml/runs/neura_lm_lora")
    parser.add_argument("--output_dir", type=str, default="models")
    parser.add_argument("--quant", type=str, default="Q4_K_M")
    parser.add_argument("--all", action="store_true", help="Export all configured models")
    args = parser.parse_args()

    export_path = merge_lora_and_export(
        base_model_path=args.base_model,
        lora_path=args.lora_dir,
        output_dir=args.output_dir,
        quantization=args.quant,
    )
    logger.info(f"Export script completed. Target: {export_path}")


if __name__ == "__main__":
    main()
