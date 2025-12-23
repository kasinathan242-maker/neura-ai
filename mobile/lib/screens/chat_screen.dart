import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'dart:convert';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final List<Map<String, String>> _messages = [];
  WebSocketChannel? _channel;

  @override
  void initState() {
    super.initState();
    _connect();
  }

  void _connect() {
    try {
        // Using localhost for emulator/local device. 10.0.2.2 for Android Emulator.
        _channel = WebSocketChannel.connect(Uri.parse('ws://10.0.2.2:8000/ws/chat'));
        _channel!.stream.listen((message) {
            try {
                final data = jsonDecode(message);
                setState(() {
                  if (data['type'] == 'message') {
                     _messages.add({
                        'role': 'ai',
                        'content': data['content']
                     });
                  }
                });
            } catch (e) {
                // ignore
            }
        }, onError: (e) {
            debugPrint("WebSocket Error: $e");
        });
    } catch (e) {
        debugPrint("Connection Error: $e");
    }
  }

  void _sendMessage() {
    if (_controller.text.isEmpty) return;
    
    final text = _controller.text;
    setState(() {
      _messages.add({'role': 'user', 'content': text});
    });
    
    _channel?.sink.add(jsonEncode({'content': text}));
    _controller.clear();
  }

  @override
  void dispose() {
    _channel?.sink.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NEURA Chat'),
        backgroundColor: const Color(0xFF0A0A0F),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty 
            ? Center(
                child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                        Icon(Icons.chat_bubble_outline, size: 48, color: Colors.white.withOpacity(0.2)),
                        const SizedBox(height: 16),
                        Text("Start a conversation", style: TextStyle(color: Colors.white.withOpacity(0.4)))
                    ]
                )
            )
            : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                final isUser = msg['role'] == 'user';
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(16),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                    decoration: BoxDecoration(
                      color: isUser ? Theme.of(context).colorScheme.primary : const Color(0xFF1F1F2E),
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(20),
                        topRight: const Radius.circular(20),
                        bottomLeft: Radius.circular(isUser ? 20 : 0),
                        bottomRight: Radius.circular(isUser ? 0 : 20),
                      ),
                      border: isUser ? null : Border.all(color: Colors.white.withOpacity(0.05)),
                    ),
                    child: Text(msg['content'] ?? '', style: const TextStyle(height: 1.5, fontSize: 16)),
                  ),
                ).animate().slideY(begin: 0.5, end: 0, duration: 300.ms).fade();
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: const Color(0xFF1F1F2E),
                      hintText: 'Ask NEURA anything...',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(30),
                        borderSide: BorderSide.none
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FloatingActionButton(
                    onPressed: _sendMessage,
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    elevation: 0,
                    child: const Icon(Icons.send_rounded),
                )
              ],
            ),
          )
        ],
      ),
    );
  }
}
