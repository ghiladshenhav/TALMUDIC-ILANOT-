
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../App';

interface AIAssistantViewProps {
    history: ChatMessage[];
    onSendMessage: (message: string) => void;
    isLoading: boolean;
}

const AIAssistantView: React.FC<AIAssistantViewProps> = ({ history, onSendMessage, isLoading }) => {
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
            <div className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xl p-4 rounded-xl ${isUser ? 'bg-primary text-background-dark' : 'bg-card-dark text-text-dark'}`}>
                    {/* Basic markdown-like formatting for paragraphs */}
                    {message.text.split('\n').map((paragraph, index) => (
                         <p key={index} className="mb-2 last:mb-0">{paragraph}</p>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 flex flex-col bg-background-dark text-text-dark overflow-hidden">
            <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col p-4 sm:p-8 space-y-4">
                <div className="flex-1 overflow-y-auto pr-4 space-y-6">
                    {history.map((msg, index) => (
                        <Message key={index} message={msg} />
                    ))}
                    {isLoading && (
                        <div className="flex gap-4 justify-start">
                            <div className="max-w-xl p-4 rounded-xl bg-card-dark text-text-dark flex items-center gap-2">
                                 <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '0s'}}></div>
                                 <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                                 <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="mt-auto pt-4">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask about themes in your graph, or request new connections..."
                            className="w-full p-4 pr-16 rounded-xl border border-border-dark bg-card-dark text-text-dark focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                            rows={2}
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            className="absolute right-3 bottom-3 h-10 w-10 flex items-center justify-center rounded-lg bg-primary text-background-dark transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Send message"
                        >
                            <span className="material-symbols-outlined">send</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIAssistantView;
