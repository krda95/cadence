import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/ui/logo/logo';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-about',
  imports: [RouterLink, Logo],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  private readonly authService = inject(AuthService);

  readonly cadenceRoute = this.authService.isLoggedIn() ? '/dashboard' : '/login';
  readonly experience = [
    {
      period: '2026 - Present',
      company: 'Blaze Tech.',
      role: 'Product Manager',
      description:
        'Building AI-powered products in healthcare SaaS, connecting product strategy with modern technologies and user needs.',
      highlights: [
        'LLM-powered AI assistant',
        'Passkey authentication and SSO',
        'API & Webhook integrations',
      ],
    },
    {
      period: '2021 - 2025',
      company: 'FARA AS',
      role: 'Product Owner',
      description:
        'Led the development of data analytics products for public transport operators, translating complex business needs into real solutions.',
      highlights: ['Product roadmap', 'Data analysis', 'Cross-functional team collaboration'],
    },
    {
      period: '2020 - 2021',
      company: 'FARA AS',
      role: 'Data Software Engineer',
      description:
        'Developed full-stack functionality and data processing solutions, building a strong technical foundation for product leadership.',
      highlights: ['Full-stack development', 'Data engineering'],
    },
    {
      period: '2018 - 2019',
      company: 'FIS',
      role: 'Technology Business Consultant',
      description:
        'Worked on enterprise technology solutions and automation of system monitoring processes.',
      highlights: ['Enterprise systems', 'Automation', 'Technical consulting'],
    },
  ];

  readonly expertise = [
    {
      number: '01',
      title: 'Product',
      subtitle: 'From complexity to clarity.',
      description:
        'I turn complex business challenges into clear product strategies, meaningful user experiences, and measurable goals.',
      skills: ['Product Discovery', 'Roadmapping', 'Stakeholder Mgmt.', 'Product Analytics'],
    },
    {
      number: '02',
      title: 'Engineering',
      subtitle: 'Understanding how things work.',
      description:
        'My engineering background helps me bridge the gap between business goals and technical execution - from architecture to implementation.',
      skills: ['TypeScript', 'Angular & React', 'Python', 'API Integrations', 'Data Engineering'],
    },
    {
      number: '03',
      title: 'Artificial Intelligence',
      subtitle: 'Building what comes next.',
      description:
        'I explore how AI can solve real problems, automate workflows, and create more intuitive digital products.',
      skills: ['LLM Applications', 'AI Agents', 'RAG', 'Prompt Engineering', 'Workflow Automation'],
    },
  ];
}
