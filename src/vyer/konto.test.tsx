// @vitest-environment jsdom
// Kodhäst's header and account (issue 66) with a made-up account.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KontoProvider, Sidhuvud, type Konto } from './konto';

const konto = (change: Partial<Konto> = {}): Konto => ({
	account: {
		name: 'Testa Testsson',
		email: null,
		photoUrl: 'https://lh3.googleusercontent.com/a/prov'
	},
	online: true,
	onSignOut: () => {},
	...change
});

describe('Sidhuvud', () => {
	it('has Kodhäst’s clock, the name, the version and the account with its Google picture', () => {
		const { container } = render(
			<KontoProvider value={konto()}>
				<Sidhuvud title="Idag" />
			</KontoProvider>
		);
		expect(container.querySelector('img.kh-header__icon')?.getAttribute('src')).toBe(
			'/favicon.svg'
		);
		expect(container.querySelector('.kh-header__name')?.textContent).toContain('Tidrapporten');
		expect(container.querySelector('.kh-header__version')?.textContent).toContain(__APP_VERSION__);
		const avatar = screen.getByRole('button', { name: 'Konto och inställningar, ansluten' });
		expect(avatar.closest('.kh-header__trailing')).not.toBeNull();
		expect(avatar.querySelector('img')?.getAttribute('src')).toBe(
			'https://lh3.googleusercontent.com/a/prov'
		);
		expect(avatar.querySelector('.kh-avatar__circle')?.textContent).toContain('TT');
	});

	it('links the menu to Inställningar and Om Tidrapporten', () => {
		const { container } = render(
			<KontoProvider value={konto({ online: false })}>
				<Sidhuvud title="Veckan" />
			</KontoProvider>
		);
		const links = [...container.querySelectorAll('.kh-menu a.kh-menu__item')];
		expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
			['Inställningar', '#/installningar'],
			['Om Tidrapporten', '#/om']
		]);
		expect(container.querySelector('.kh-menu')?.textContent).toContain('Logga ut');
		screen.getByRole('button', { name: 'Konto och inställningar, utan anslutning' });
	});
});
