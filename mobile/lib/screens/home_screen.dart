import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
           gradient: RadialGradient(
             center: Alignment.topLeft,
             radius: 1.5,
             colors: [
               Theme.of(context).colorScheme.primary.withOpacity(0.15),
               Theme.of(context).scaffoldBackgroundColor,
             ]
           )
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),
                Text('Good Afternoon', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: Colors.white70)),
                Text('NEURA AI', style: Theme.of(context).textTheme.displayMedium?.copyWith(fontWeight: FontWeight.bold, color: Colors.white)),
                const SizedBox(height: 40),
                
                Text('Modules', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 20),

                Expanded(
                  child: GridView.count(
                      crossAxisCount: 2,
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                      children: [
                          _FeatureCard(
                              label: 'Adaptive Study', 
                              icon: Icons.school_rounded, 
                              color: Theme.of(context).colorScheme.primary,
                              onTap: () {},
                          ),
                          _FeatureCard(
                              label: 'AI Chat', 
                              icon: Icons.chat_bubble_rounded, 
                              color: Theme.of(context).colorScheme.secondary,
                              onTap: () => context.push('/chat'),
                          ),
                          _FeatureCard(
                              label: 'Coding', 
                              icon: Icons.code_rounded, 
                              color: Theme.of(context).colorScheme.tertiary,
                              onTap: () {},
                          ),
                           _FeatureCard(
                              label: 'PDF', 
                              icon: Icons.picture_as_pdf_rounded, 
                              color: Colors.emerald,
                              onTap: () {},
                          ),
                      ],
                  ).animate().fade().scale(),
                )
              ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: Colors.transparent,
        indicatorColor: Theme.of(context).colorScheme.primary.withOpacity(0.2),
        destinations: const [
            NavigationDestination(icon: Icon(Icons.home_filled), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Chat'),
            NavigationDestination(icon: Icon(Icons.book_outlined), label: 'Study'),
        ],
      )
    );
  }
}

class _FeatureCard extends StatelessWidget {
    final String label;
    final IconData icon;
    final Color color;
    final VoidCallback onTap;

    const _FeatureCard({required this.label, required this.icon, required this.color, required this.onTap});

    @override
    Widget build(BuildContext context) {
        return InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(24),
            child: Container(
                decoration: BoxDecoration(
                    color: const Color(0xFF13131F).withOpacity(0.6),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.2),
                        blurRadius: 10,
                        offset: const Offset(0, 4)
                      )
                    ]
                ),
                child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                        Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                                color: color.withOpacity(0.1),
                                shape: BoxShape.circle,
                            ),
                            child: Icon(icon, color: color, size: 32),
                        ),
                        const SizedBox(height: 16),
                        Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    ],
                ),
            ),
        );
    }
}
