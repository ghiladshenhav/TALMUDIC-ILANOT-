import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../App';
import { GraphNode, RootNode } from '../types';

interface AIAssistantViewProps {
    history: ChatMessage[];
    onSendMessage: (message: string) => void;
    isLoading: boolean;
    onSyncLibrary?: () => void;
    activeNode?: GraphNode;
}

const AIAssistantView: React.FC<AIAssistantViewProps> = ({ history, onSendMessage, isLoading, onSyncLibrary, activeNode }) => {
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
            let messageToSend = input.trim();

            // Inject context if activeNode is present
            if (activeNode) {
                const contextTitle = activeNode.type === 'root'
                    ? (activeNode as RootNode).sourceText
                    : (activeNode as any).workTitle || 'Unknown Work';

                messageToSend = `[Context: Viewing "${contextTitle}"] ${messageToSend}`;
            }

            onSendMessage(messageToSend);
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
        <div className="flex-1 flex flex-col bg-background-dark text-text-dark overflow-hidden h-full">
            <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col p-4 sm:p-8 space-y-4 min-h-0">
                {/* Header with Sync Button */}
                <div className="flex justify-between items-center pb-4 border-b border-border-dark">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">smart_toy</span>
                            AI Research Assistant
                        </h2>
                        {activeNode && (
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full w-fit">
                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                Viewing: {activeNode.type === 'root' ? (activeNode as RootNode).sourceText : (activeNode as any).workTitle}
                            </div>
                        )}
                    </div>
                    {onSyncLibrary && (
                        <button
                            onClick={onSyncLibrary}
                            className="flex items-center gap-2 px-3 py-1.5 bg-surface-paper/10 hover:bg-surface-paper/20 rounded-lg text-sm transition-colors text-subtext-dark hover:text-text-dark"
                            title="Sync your library texts to the AI context"
                        >
                            <span className="material-symbols-outlined text-[18px]">sync</span>
                            Sync Library
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto pr-4 space-y-6">
                    {history.map((msg, index) => (
                        <Message key={index} message={msg} />
                    ))}
                    {isLoading && (
                        <div className="flex gap-4 justify-start">
                            <div className="max-w-xl p-4 rounded-xl bg-card-dark text-text-dark flex items-center gap-2">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
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
                            placeholder={activeNode ? `Ask about this text...` : "Ask about themes in your graph, or request new connections..."}
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
