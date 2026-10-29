import { Component } from '@angular/core';

@Component({
  selector: 'app-about-expertise',
  templateUrl: './expertise.html',
  styleUrl: './expertise.scss',
})
export class Expertise {
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
