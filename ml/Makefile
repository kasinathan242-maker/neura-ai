.PHONY: all data train-lm train-sum train-card train-embed train-stt train-tts eval-all export-all clean

PYTHON ?= python

all: data train-lm train-sum train-card train-embed train-stt train-tts eval-all export-all

data:
	@echo "=== Building dataset: Anna Univ syllabus, Tanglish dialogues, Socratic pairs, Safety set ==="
	$(PYTHON) data/build_dataset.py --output_dir ./data/processed

train-lm:
	@echo "=== Fine-tuning NEURA-LM with QLoRA (Rank 16) on Qwen2.5-1.5B ==="
	$(PYTHON) train/train_lm.py --config configs/neura_lm.yaml

train-sum:
	@echo "=== Fine-tuning NEURA-SUM adapter for PDF & lecture notes summarization ==="
	$(PYTHON) train/train_sum.py --config configs/neura_sum.yaml

train-card:
	@echo "=== Fine-tuning NEURA-CARD adapter with JSON schema constraint ==="
	$(PYTHON) train/train_card.py --config configs/neura_card.yaml

train-embed:
	@echo "=== Contrastive fine-tuning of NEURA-EMBED (multilingual-e5-small) ==="
	$(PYTHON) train/train_embed.py --config configs/neura_embed.yaml

train-stt:
	@echo "=== Fine-tuning NEURA-STT (whisper-small) on Tamil + Indian English ==="
	$(PYTHON) train/train_stt.py --config configs/neura_stt.yaml

train-tts:
	@echo "=== Training NEURA-TTS (Piper ONNX) English and Tamil acoustic models ==="
	$(PYTHON) train/train_tts.py --config configs/neura_tts.yaml

eval-all:
	@echo "=== Running rigorous evaluation: syllabus QA exact-match, rubric, and latency ==="
	$(PYTHON) eval/eval_rubric.py --eval_all

export-all:
	@echo "=== Merging LoRA weights and converting to GGUF (Q4_K_M) and ONNX ==="
	$(PYTHON) export/export_gguf.py --all

clean:
	@echo "=== Cleaning temporary training checkpoints ==="
	rm -rf ./runs/checkpoints_tmp
