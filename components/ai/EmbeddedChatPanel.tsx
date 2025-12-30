import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../../App';

interface EmbeddedChatPanelProps {
    history: ChatMessage[];
    onSendMessage: (message: string) => void;
    isLoading: boolean;
}

const EmbeddedChatPanel: React.FC<EmbeddedChatPanelProps> = ({ history, onSendMessage, isLoading }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [history, isLoading]);

    const handleSend = () => {
        if (input.trim()) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const Message: React.FC<{ message: ChatMessage }> = ({ message }) => {
        const isUser = message.role === 'user';
        return (
            <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg text-sm ${isUser ? 'bg-primary text-background-dark' : 'bg-card-dark text-text-dark border border-border-dark'}`}>
                    {message.text.split('\n').map((paragraph, index) => (
                        <p key={index} className="mb-1 last:mb-0">{paragraph}</p>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-surface-dark overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {history.length === 0 && (
                    <div className="text-center text-subtext-dark text-sm mt-8">
                        <span className="material-symbols-outlined text-3xl mb-2 opacity-50">chat</span>
                        <p>Ask questions about this text...</p>
                    </div>
                )}
                {history.map((msg, index) => (
                    <Message key={index} message={msg} />
                ))}
                {isLoading && (
                    <div className="flex gap-3 justify-start">
                        <div className="p-3 rounded-lg bg-card-dark text-text-dark border border-border-dark flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-border-dark bg-background-dark">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask a question..."
                        className="w-full p-3 pr-12 rounded-lg border border-border-dark bg-surface-dark text-text-dark text-sm focus:ring-1 focus:ring-primary focus:outline-none resize-none"
                        rows={1}
                        style={{ minHeight: '44px', maxHeight: '120px' }}
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="absolute right-2 bottom-2 h-7 w-7 flex items-center justify-center rounded bg-primary text-background-dark transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Send message"
                    >
                        <span className="material-symbols-outlined text-sm">send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EmbeddedChatPanel;
