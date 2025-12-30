echo "🔍 Searching for DictaLM GGUF files in Downloads..."

GGUF_FILE=""
MODEL_NAME=""

# 1. Check for Dicta 3.0 24B Thinking (IQ2_XXS from mradermacher) - BEST REASONING / SMALLEST FILE
if [ -z "$GGUF_FILE" ]; then
    GGUF_FILE=$(find ~/Downloads -maxdepth 1 -name "*DictaLM*24B*Thinking*gguf" | head -n 1)
    MODEL_NAME="dicta-lm-24b"
fi

# 2. Check for Dicta 3.0 12B (Any Quantization) - HIGH QUALITY
if [ -z "$GGUF_FILE" ]; then
    GGUF_FILE=$(find ~/Downloads -maxdepth 1 -name "*DictaLM*12B*gguf" | head -n 1)
    MODEL_NAME="dicta-lm-12b"
fi

# 3. Check for Dicta 2.0 (7B) - STABLE FALLBACK
if [ -z "$GGUF_FILE" ]; then
    GGUF_FILE=$(find ~/Downloads -maxdepth 1 -name "*dictalm2.0*instruct*gguf" | head -n 1)
    MODEL_NAME="dicta-lm-2"
fi

# 4. Check for Dicta 3.0 1.7B (Instruct) - LOW RAM
if [ -z "$GGUF_FILE" ]; then
    GGUF_FILE=$(find ~/Downloads -maxdepth 1 -name "*DictaLM*1.7B*Instruct*gguf" | head -n 1)
    MODEL_NAME="dicta-lm-3"
fi

if [ -z "$GGUF_FILE" ]; then
    echo "❌ No supported DictaLM GGUF file found in ~/Downloads."
    echo ""
    echo "⬇️ RECOMMENDED: DictaLM 3.0 24B Thinking (IQ2_XXS) - 6.76GB"
    echo "   https://huggingface.co/mradermacher/DictaLM-3.0-24B-Thinking-i1-GGUF"
    echo "   (Look for the file with 'IQ2_XXS' in the name)"
    echo ""
    echo "   Alternatives:"
    echo "   - DictaLM 3.0 12B: https://huggingface.co/dicta-il/DictaLM-3.0-Nenotron-12B-Instruct-GGUF"
    echo "   - DictaLM 2.0 (7B): https://huggingface.co/dicta-il/dictalm2.0-instruct-GGUF"
    exit 1
fi

echo "✅ Found file: $GGUF_FILE"
echo "🚀 Target Model Name: $MODEL_NAME"


# Create Modelfile pointing DIRECTLY to the download (No copying!)
echo "📝 Creating Modelfile (referencing file in Downloads)..."

if [ "$MODEL_NAME" == "dicta-lm-2" ]; then
    # Dicta 2.0 / Mistral Template
    echo "ℹ️  Using Mistral Chat Template for Dicta 2.0"
    cat <<EOF > Modelfile.dicta
FROM $GGUF_FILE

TEMPLATE """[INST] {{ if .System }}{{ .System }}
{{ end }}{{ .Prompt }} [/INST]"""

PARAMETER stop "[INST]"
PARAMETER stop "[/INST]"
PARAMETER temperature 0.3
EOF

elif [ "$MODEL_NAME" == "dicta-lm-24b" ]; then
    # Dicta 3.0 24B Thinking / ChatML Template with Reasoning settings
    echo "ℹ️  Using ChatML Template for Dicta 3.0 24B Thinking"
    echo "ℹ️  Optimized for reasoning tasks (temperature 0.6, context 8192)"
    cat <<EOF > Modelfile.dicta
FROM $GGUF_FILE

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
"""

PARAMETER stop "<|im_end|>"
PARAMETER temperature 0.6
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 8192
EOF

else
    # Dicta 3.0 12B or 1.7B / ChatML Template
    echo "ℹ️  Using ChatML Template for Dicta 3.0"
    
    # Critical for 12B on 16GB RAM: Limit context to 2048 to prevent crashes
    CTX_SIZE=2048
    if [ "$MODEL_NAME" == "dicta-lm-3" ]; then
        # 1.7B can handle more
        CTX_SIZE=8192
    fi

    cat <<EOF > Modelfile.dicta
FROM $GGUF_FILE

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
"""

PARAMETER stop "<|im_end|>"
PARAMETER temperature 0.3
PARAMETER num_ctx $CTX_SIZE
EOF
fi

echo "🚀 Creating Ollama model '$MODEL_NAME'..."
ollama create $MODEL_NAME -f Modelfile.dicta

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! Installed as '$MODEL_NAME'."
    echo "🧹 Cleaning up..."
    rm "$FILENAME" Modelfile.dicta
    echo "🎉 You can now use the model in the app! (Refresh the page)"
else
    echo "❌ Failed to create model. Checks logs above."
fi
