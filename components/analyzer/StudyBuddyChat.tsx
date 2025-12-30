import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { generateContentWithRetry } from '../../utils/ai-helpers';
import { AIFinding } from '../../types';

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

interface StudyBuddyChatProps {
    contextText: string;
    textTitle: string;
    author: string;
    findings?: AIFinding[];
}

const StudyBuddyChat: React.FC<StudyBuddyChatProps> = ({ contextText, textTitle, author, findings = [] }) => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'model',
            text: `Hello! I'm your study buddy for "${textTitle}" by ${author}. Ask me anything about the text, or ask me to explain specific concepts!`,
            timestamp: Date.now()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            text: inputValue,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
            const model = 'gemini-2.0-flash'; // Fast model for chat

            // Construct history for context
            // We include the full text in the system instruction or first message context
            const findingsContext = findings.length > 0
                ? `\n\n--- IDENTIFIED TEXT REFERENCES ---\nThe following Talmudic references were found in the text. Use them to answer questions about sources:\n${findings.map(f => `- **${f.source}** (Page/Slide: ${f.pageNumber || 'N/A'})\n  Snippet: "${f.snippet}"\n  Hebrew Text: "${f.hebrewText || 'N/A'}"\n  Translation: "${f.translation || 'N/A'}"\n  Justification: ${f.justification}`).join('\n\n')}\n--- END REFERENCES ---\n`
                : "";

            const systemPrompt = `You are a helpful Talmudic study assistant. 
            The user is currently reading the following text:
            
            Title: ${textTitle}
            Author: ${author}
            
            --- BEGIN TEXT CONTENT ---
            ${contextText.substring(0, 1000000)} ${contextText.length > 1000000 ? '...(text truncated for context window)...' : ''}
            --- END TEXT CONTENT ---

            ${findingsContext}

            Your goal is to help the user understand THIS text. 
            - Answer questions specific to the content above.
            - If asked for "references", point out where they are in the text.
            - Explain difficult concepts using the text as a basis.
            - **CRITICAL**: If the user asks about a Talmudic source, check the "IDENTIFIED TEXT REFERENCES" list above. If the text is there, QUOTE IT directly.
            - Be concise but helpful.
            `;

            const chatHistory = messages.filter(m => m.id !== 'welcome').map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

            // We use generateContent but manually structure the history + system prompt
            // simpler than managing a persistent ChatSession object for this embedded view
            const response = await generateContentWithRetry(ai.models, {
                model: model,
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt }] }, // Priming with context
                    { role: 'model', parts: [{ text: "Understood. I have read the text and am ready to help." }] },
                    ...chatHistory,
                    { role: 'user', parts: [{ text: userMsg.text }] }
                ]
            });

            const aiText = response.text || "I'm sorry, I couldn't generate a response.";

            const aiMsg: Message = {
                id: crypto.randomUUID(),
                role: 'model',
                text: aiText,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, aiMsg]);

        } catch (error) {
            console.error("Chat error:", error);
            const errorMsg: Message = {
                id: crypto.randomUUID(),
                role: 'model',
                text: "I encountered an error trying to answer that. Please try again.",
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-card-dark rounded-xl overflow-hidden border border-border-dark">
            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {messages.map(msg => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap ${msg.role === 'user'
                                ? 'bg-primary text-background-dark font-medium rounded-tr-none'
                                : 'bg-white/10 text-white rounded-tl-none'
                                }`}
                        >
                            {msg.text}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white/10 text-white rounded-2xl rounded-tl-none px-4 py-3 flex items-center space-x-2">
                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-4 bg-surface-dark border-t border-border-dark shrink-0">
                <div className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask about this text..."
                        className="w-full bg-background-dark/50 text-white placeholder-subtext-dark rounded-lg pl-4 pr-12 py-3 border border-border-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-primary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md hover:bg-white/10"
                    >
                        <span className="material-symbols-outlined text-[20px]">send</span>
                    </button>
                </div>
            </form>
        </div>
    );
};

export default StudyBuddyChat;
