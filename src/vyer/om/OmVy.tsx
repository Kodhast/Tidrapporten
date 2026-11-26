// Om Tidrapporten (issue 66): reached from the account menu, with a back arrow to Idag.
import { Card, Row, TopBar } from '@kodhast/web-ui-react';
import { APP_NAME, APP_VERSION, AppIcon } from '../konto';
import { href } from '../rutter.ts';

const SOURCE = 'https://github.com/Kodhast/Tidrapporten';

export function OmVy() {
	return (
		<>
			<TopBar title={`Om ${APP_NAME}`} backHref={href({ view: 'idag' })} />
			<div className="innehall">
				<Card>
					<div className="om">
						<AppIcon className="om-ikon" />
						<h2 className="kh-text-section-title">{APP_NAME}</h2>
						<p className="kh-text-item-subtitle dampad">{`Version ${APP_VERSION}`}</p>
						<p className="kh-text-body">
							Faktisk tid med timer, veckorapporter per mottagare och flex, för en IT-konsult.
						</p>
					</div>
				</Card>
				<div className="kh-card radlista">
					<Row
						href={SOURCE}
						title="Källkoden"
						subtitle="github.com/Kodhast/Tidrapporten"
						navigates
					/>
					<Row
						href={`${SOURCE}/blob/main/CHANGELOG.md`}
						title="Vad som ändrats"
						subtitle="CHANGELOG.md"
						navigates
					/>
				</div>
			</div>
		</>
	);
}
